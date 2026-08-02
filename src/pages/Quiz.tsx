import { useEffect, useRef, useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import { generateQuiz, type Quiz as QuizType } from '../services/aiTools';
import { aiReady } from '../services/aiTools';
import { copyToClipboard } from '../services/export';
import { loadBank } from '../services/questionBank';

export function Quiz() {
  const setStatus = useData((s) => s.setStatus);
  const [quiz, setQuiz] = useState<QuizType | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState(10);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [bankMode, setBankMode] = useState(false);
  const [bankCount, setBankCount] = useState(10);
  const timerRef = useRef<any>(null);
  const bank = loadBank();

  useEffect(() => {
    if (!submitted && quiz && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            setSubmitted(true);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [quiz, submitted, timeLeft > 0]);

  async function start() {
    if (!aiReady('questionGen')) {
      setStatus('⚠️ Enable the AI Question Generator and add an API key in Settings → AI first.');
      return;
    }
    setLoading(true);
    setQuiz(null);
    setAnswers([]);
    setSubmitted(false);
    setCurrent(0);
    setStatus('🤖 Generating quiz from your clinical exposure…');
    const q = await generateQuiz(focus, count);
    setLoading(false);
    if (!q) {
      setStatus('⚠️ Could not generate a quiz. Check your AI key / connection.');
      return;
    }
    setQuiz(q);
    setAnswers(new Array(q.questions.length).fill(-1));
    setTimeLeft(q.questions.length * 60); // 60s per question
    setStatus(`✓ Quiz ready — ${q.questions.length} questions`);
  }

  function startFromBank() {
    if (!bank.length) {
      setStatus('⚠️ Your question bank is empty. Add questions in Question Bank first.');
      return;
    }
    const shuffled = [...bank].sort(() => Math.random() - 0.5).slice(0, Math.min(bankCount, bank.length));
    const q: QuizType = {
      title: 'Question Bank Quiz',
      questions: shuffled.map((b) => ({ question: b.question, options: b.options, answer: b.answer, explanation: b.explanation })),
    };
    setQuiz(q);
    setAnswers(new Array(q.questions.length).fill(-1));
    setSubmitted(false);
    setCurrent(0);
    setTimeLeft(q.questions.length * 60);
    setSetupOpen(false);
    setStatus(`✓ Quiz ready from bank — ${q.questions.length} questions`);
  }

  const score = quiz ? quiz.questions.filter((_, i) => answers[i] === quiz.questions[i].answer).length : 0;
  const pct = quiz ? Math.round((score / quiz.questions.length) * 100) : 0;
  const allAnswered = quiz ? answers.every((a) => a !== -1) : false;

  function pick(i: number) {
    if (submitted) return;
    setAnswers((a) => { const n = [...a]; n[current] = i; return n; });
  }

  function submit() {
    if (submitted) return;
    setSubmitted(true);
    clearInterval(timerRef.current);
    setStatus(`✓ Quiz submitted — ${score}/${quiz?.questions.length ?? 0}`);
  }

  async function share() {
    if (!quiz) return;
    const lines = [
      `# ${quiz.title}`,
      '',
      `Score: ${score}/${quiz.questions.length} (${pct}%)`,
      '',
    ];
    quiz.questions.forEach((q, i) => {
      lines.push(`**${i + 1}. ${q.question}**`);
      q.options.forEach((o, oi) => lines.push(`${oi === q.answer ? '✓' : oi === answers[i] && answers[i] !== q.answer ? '✗' : ' '} ${String.fromCharCode(65 + oi)}. ${o}`));
      lines.push(`_Explanation: ${q.explanation}_`);
      lines.push('');
    });
    await copyToClipboard(lines.join('\n'));
    setStatus('✓ Quiz + answers copied — paste it anywhere to share');
  }

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      <PageHeader
        title="AI Quiz"
        subtitle="AI generates a browser-style exam from your clinical exposure — timed, scored, reviewable and shareable."
        action={<button className="btn-primary" onClick={() => setSetupOpen(true)}>＋ New Quiz</button>}
      />

      {!quiz && !loading ? (
        <EmptyState
          icon="📝"
          title="No quiz yet"
          hint="Generate a timed multiple-choice exam from your recorded conditions, medicines, investigations and questions."
          actions={<button className="btn-primary" onClick={() => setSetupOpen(true)}>＋ Create a Quiz</button>}
        />
      ) : loading ? (
        <EmptyState icon="🤖" title="Generating your quiz…" hint="This may take a moment while AI builds questions from your progress." />
      ) : quiz ? (
        <div className="space-y-4">
          {/* Exam header */}
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{quiz.title}</h2>
              <div className="text-xs text-slate-400">{quiz.questions.length} questions · {Math.round((quiz.questions.length * 60) / 60)} min</div>
            </div>
            <div className="flex items-center gap-3">
              {!submitted ? (
                <>
                  <Pill color={timeLeft <= 60 ? 'red' : 'green'}>⏱ {mmss(timeLeft)}</Pill>
                  <button className="btn-primary" onClick={submit} disabled={!allAnswered}>Submit ({answers.filter((a) => a !== -1).length}/{quiz.questions.length})</button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-extrabold text-brand-600">{pct}%</span>
                  <Pill color={pct >= 70 ? 'green' : pct >= 50 ? 'amber' : 'red'}>{score}/{quiz.questions.length}</Pill>
                </div>
              )}
            </div>
          </div>

          {/* Question navigator */}
          <div className="flex flex-wrap gap-1.5">
            {quiz.questions.map((_, i) => (
              <button
                key={i}
                onClick={() => { if (!submitted) setCurrent(i); }}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                  i === current ? 'bg-brand-600 text-white'
                  : answers[i] !== -1 ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                } ${submitted ? 'cursor-default' : ''}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Current question */}
          <div className="card">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
              <span>Question {current + 1} of {quiz.questions.length}</span>
              {answers[current] !== -1 && !submitted && <span className="text-green-600">Answered</span>}
            </div>
            <p className="mb-4 text-base font-semibold">{quiz.questions[current].question}</p>
            <div className="space-y-2">
              {quiz.questions[current].options.map((opt, oi) => {
                const isAnswer = submitted && oi === quiz.questions[current].answer;
                const isWrong = submitted && oi === answers[current] && oi !== quiz.questions[current].answer;
                const selected = oi === answers[current];
                return (
                  <button
                    key={oi}
                    onClick={() => pick(oi)}
                    disabled={submitted}
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      isAnswer ? 'border-green-500 bg-green-50 dark:bg-green-900'
                      : isWrong ? 'border-red-500 bg-red-50 dark:bg-red-900'
                      : selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900'
                      : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'
                    } ${submitted ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <span className="font-bold text-slate-400">{String.fromCharCode(65 + oi)}.</span>
                    <span>{opt}</span>
                    {isAnswer && <span className="ml-auto text-green-600">✓</span>}
                    {isWrong && <span className="ml-auto text-red-500">✗</span>}
                  </button>
                );
              })}
            </div>
            {submitted && quiz.questions[current].explanation && (
              <div className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                💡 <span className="font-semibold">Explanation:</span> {quiz.questions[current].explanation}
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button className="btn-secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>‹ Previous</button>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setReviewOpen(true)}>Review all</button>
              <button className="btn-primary" onClick={share}>📤 Share quiz</button>
            </div>
            <button className="btn-secondary" disabled={current === quiz.questions.length - 1} onClick={() => setCurrent((c) => c + 1)}>Next ›</button>
          </div>
        </div>
      ) : null}

      {/* Setup modal */}
      <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Create Quiz">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className={`btn ${!bankMode ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`} onClick={() => setBankMode(false)}>🤖 AI-generated</button>
          <button className={`btn ${bankMode ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`} onClick={() => setBankMode(true)}>🗂 From question bank</button>
        </div>

        {!bankMode ? (
          <div className="space-y-3">
            <div>
              <label className="label">Focus topic (optional)</label>
              <input className="input" placeholder="e.g. antihypertensives, or leave blank for everything" value={focus} onChange={(e) => setFocus(e.target.value)} />
            </div>
            <div>
              <label className="label">Number of questions</label>
              <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={loading} onClick={() => { setSetupOpen(false); start(); }}>
                {loading ? 'Generating…' : 'Start Quiz'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              Start a quiz using <strong>{bank.length}</strong> question(s) from your bank (randomly selected, no AI needed).
            </div>
            <div>
              <label className="label">Number of questions</label>
              <select className="input" value={bankCount} onChange={(e) => setBankCount(Number(e.target.value))}>
                {[5, 10, 15, Math.min(20, bank.length)].filter((n, i, a) => a.indexOf(n) === i).map((n) => <option key={n} value={n}>{Math.min(n, bank.length)} questions</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={startFromBank}>Start from bank</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Review-all modal */}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review all questions" wide>
        <div className="space-y-4">
          {quiz?.questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-200">Q{i + 1}. {q.question}</span>
                {answers[i] === q.answer ? <Pill color="green">Correct</Pill> : <Pill color="red">Wrong</Pill>}
              </div>
              <div className="ml-3 text-xs text-slate-500 dark:text-slate-300">
                {q.options.map((o, oi) => (
                  <div key={oi} className={oi === q.answer ? 'text-green-600' : oi === answers[i] ? 'text-red-500' : ''}>
                    {String.fromCharCode(65 + oi)}. {o} {oi === q.answer ? '✓' : ''}
                  </div>
                ))}
                <div className="mt-1 text-slate-400">💡 {q.explanation}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
