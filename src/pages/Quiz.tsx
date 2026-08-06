import { useEffect, useRef, useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import { generateQuiz, type Quiz as QuizType } from '../services/aiTools';
import { aiReady } from '../services/aiTools';
import { copyToClipboard } from '../services/export';
import { loadBank } from '../services/questionBank';
import { useContextMenu, ctxHandlers, type CtxItem } from '../components/ContextMenu';
import { AiThinking } from '../components/AiThinking';
import { useTasks } from '../stores/tasks';
import { newSavedQuiz } from '../services/defaults';
import type { SavedQuiz } from '../types';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

export function Quiz() {
  const setStatus = useData((s) => s.setStatus);
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);
  const savedQuizzes = useData((s) => s.quizzes);

  const [quiz, setQuiz] = useState<QuizType | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState(10);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [bankMode, setBankMode] = useState(false);
  const [bankCount, setBankCount] = useState(10);
  const [streamText, setStreamText] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null); // reviewing a saved quiz
  const timerRef = useRef<any>(null);
  const bank = loadBank();
  const showMenu = useContextMenu();
  // Global task store: the generation continues even when the component
  // unmounts (user navigates away); the result is picked up on return.
  const tasks = useTasks((s) => s.tasks);
  const startTask = useTasks((s) => s.startTask);
  const appendStream = useTasks((s) => s.appendStream);
  const finishTask = useTasks((s) => s.finishTask);
  const failTask = useTasks((s) => s.failTask);
  const clearTask = useTasks((s) => s.clearTask);
  // Our own quiz task (kind 'quiz') — the AI layer creates a 'questionGen'
  // task internally; this one is what Quiz uses to adopt on return.
  const myTask = tasks.find((t) => t.kind === 'quiz' && t.status === 'running') || tasks.find((t) => t.kind === 'quiz');

  // Adopt a finished quiz task when it completes (even if we were on another
  // tab) or surface its error.
  useEffect(() => {
    if (myTask?.status === 'done' && myTask.resultText) {
      try {
        const start = myTask.resultText.indexOf('{');
        const end = myTask.resultText.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(myTask.resultText.slice(start, end + 1));
          const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
          if (qs.length) {
            setQuiz({ title: parsed.title || 'CLINICAL Rx Quiz', questions: qs as QuizType['questions'] });
            setAnswers(new Array(qs.length).fill(-1));
            setSubmitted(false);
            setCurrent(0);
            setSavedId(null);
            setTimeLeft(qs.length * 60);
            setLoading(false);
            setStatus(`✓ Quiz ready — ${qs.length} questions`);
            clearTask(myTask.id);
          }
        }
      } catch { /* ignore parse issues */ }
    } else if (myTask?.status === 'error') {
      setLoading(false);
      setStatus('⚠️ ' + (myTask.error || 'Could not generate a quiz.'));
      clearTask(myTask.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTask?.status, myTask?.resultText, myTask?.error]);

  function historyMenu(q: SavedQuiz): CtxItem[] {
    return [
      { label: 'Review', icon: '👁', onClick: () => openHistory(q.id) },
      { label: 'Retry wrong answers', icon: '🔁', onClick: () => startRetry(q, true) },
      { label: 'Retry same quiz', icon: '↻', onClick: () => startRetry(q, false) },
      { label: 'Delete', icon: '🗑', danger: true, onClick: () => void deleteHistory(q.id) },
    ];
  }

  useEffect(() => {
    if (!submitted && quiz && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            // Time's up — auto-submit AND save (so the quiz isn't lost).
            void submit();
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
    setSavedId(null);
    setStreamText('');
    setStatus('🤖 Generating quiz from your clinical exposure…');

    // Create OUR quiz task (kind 'quiz') so it survives unmount and can be
    // adopted when the user returns. generateQuiz also creates a
    // 'questionGen' task internally (shown by the left indicator) — that's
    // fine; this one carries the final result back to the page.
    const taskId = startTask({
      kind: 'quiz',
      section: 'questionGen',
      label: `Generating ${count}-question quiz${focus ? ' on ' + focus : ''}`,
    });
    const q = await generateQuiz(focus, count, {
      onToken: (t) => {
        setStreamText((s) => (s + t).slice(-500));
        appendStream(taskId, t);
      },
    });
    setLoading(false);
    if (!q) {
      failTask(taskId, 'Could not generate a quiz. Check your AI key / connection.');
      setStatus('⚠️ Could not generate a quiz. Check your AI key / connection.');
      return;
    }
    // Persist the result into our task so the adopt effect picks it up on
    // return, and also adopt immediately (we're still mounted).
    finishTask(taskId, JSON.stringify({ title: q.title, questions: q.questions }));
    // Log this generation to the Questions section (AI → Questions).
    import('../services/aiTools').then((m) => m.logAiTask('questionGen', `Generate ${count} quiz question(s)${focus ? ' on ' + focus : ''}`, `Quiz "${q.title}" generated — ${q.questions.length} questions`)).catch(() => {});
    setQuiz(q);
    setAnswers(new Array(q.questions.length).fill(-1));
    setTimeLeft(q.questions.length * 60); // 60s per question
    setStatus(`✓ Quiz ready — ${q.questions.length} questions`);
    // NOTE: do NOT clearTask here — if the user navigated away, the adopt
    // effect (which runs on return) needs the finished task to pick up.
    // The effect clears it after adopting.
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
    setSavedId(null);
    setTimeLeft(q.questions.length * 60);
    setSetupOpen(false);
    setStatus(`✓ Quiz ready from bank — ${q.questions.length} questions`);
  }

  function startFresh() {
    setQuiz(null);
    setAnswers([]);
    setSubmitted(false);
    setCurrent(0);
    setSavedId(null);
    setTimeLeft(0);
    setReviewOpen(false);
    setHistoryOpen(false);
    setSetupOpen(true);
  }

  /** Close the current quiz and return to the quiz home (history stays). */
  function exitQuiz() {
    setQuiz(null);
    setAnswers([]);
    setSubmitted(false);
    setCurrent(0);
    setSavedId(null);
    setTimeLeft(0);
    setStreamText('');
    setReviewOpen(false);
    setHistoryOpen(false);
  }

  /** Re-quiz: build a fresh session from the given questions (optionally only the wrong ones). */
  function startRetry(source: { title: string; questions: QuizType['questions']; answers?: number[] }, onlyWrong: boolean) {
    const qs = onlyWrong
      ? source.questions.map((q, i) => ({ q, i })).filter(({ q, i }) => (source.answers?.[i] ?? -1) !== q.answer).map(({ q }) => q)
      : source.questions;
    if (!qs.length) {
      setStatus(onlyWrong ? '🎉 Perfect score — nothing to retry!' : 'No questions to retry.');
      return;
    }
    const title = (onlyWrong ? 'Retry: wrong answers — ' : 'Retry: ') + source.title;
    setQuiz({ title, questions: qs });
    setAnswers(new Array(qs.length).fill(-1));
    setSubmitted(false);
    setCurrent(0);
    setSavedId(null);
    setTimeLeft(qs.length * 60);
    setReviewOpen(false);
    setHistoryOpen(false);
    setStatus(`✓ Retry quiz ready — ${qs.length} question(s)`);
  }

  const score = quiz ? quiz.questions.filter((_, i) => answers[i] === quiz.questions[i].answer).length : 0;
  const pct = quiz ? Math.round((score / quiz.questions.length) * 100) : 0;
  const allAnswered = quiz ? answers.every((a) => a !== -1) : false;

  function pick(i: number) {
    if (submitted) return;
    setAnswers((a) => { const n = [...a]; n[current] = i; return n; });
  }

  async function submit() {
    if (submitted || !quiz) return;
    setSubmitted(true);
    clearInterval(timerRef.current);
    const duration = Math.max(0, Math.round(((quiz.questions.length * 60) - timeLeft)));
    // Persist the completed quiz so it can be reviewed anytime.
    const rec = newSavedQuiz({
      title: quiz.title,
      questions: quiz.questions,
      answers,
      score,
      durationSeconds: duration,
    });
    await save('quiz', rec);
    setSavedId(rec.id);
    setStatus(`✓ Quiz saved & submitted — ${score}/${quiz.questions.length}`);
  }

  function openHistory(id: string) {
    const rec = savedQuizzes.find((q) => q.id === id);
    if (!rec) return;
    setQuiz({
      title: rec.title,
      questions: rec.questions,
    });
    setAnswers(rec.answers);
    setSubmitted(true);
    setCurrent(0);
    setSavedId(rec.id);
    setTimeLeft(0);
    setHistoryOpen(false);
    setStatus(`Reviewing "${rec.title}" (${rec.score}/${rec.total})`);
  }

  async function deleteHistory(id: string) {
    if (!confirm('Delete this saved quiz?')) return;
    await remove('quiz', id);
    if (savedId === id) startFresh();
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
        subtitle="Timed exams from your clinical exposure — every result is saved and reviewable anytime. Tap a question number to jump straight to it."
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setHistoryOpen(true)}>📚 History ({savedQuizzes.length})</button>
            <button className="btn-primary" onClick={startFresh}>＋ New Quiz</button>
          </div>
        }
      />

      {!quiz && !loading ? (
        <EmptyState
          icon="📝"
          title="No quiz yet"
          hint="Generate a timed multiple-choice exam from your recorded conditions, medicines, investigations and questions — results are saved automatically for review anytime."
          actions={<button className="btn-primary" onClick={startFresh}>＋ Create a Quiz</button>}
        />
      ) : loading ? (
        <div className="card max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Generating your quiz…</h2>
            {streamText && <span className="text-xs text-slate-400">streaming…</span>}
          </div>
          <AiThinking moduleLabel="AI Question Generator" live={streamText || undefined} detail={!streamText ? 'Building questions from your clinical exposure…' : undefined} />
        </div>
      ) : quiz ? (
        <div className="space-y-4">
          {/* Exam header */}
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{quiz.title}</h2>
              <div className="text-xs text-slate-400">
                {quiz.questions.length} questions · {Math.round((quiz.questions.length * 60) / 60)} min
                {savedId && savedQuizzes.find((q) => q.id === savedId) && (
                  <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-200">
                    ✓ Saved · {fmtTime(savedQuizzes.find((q) => q.id === savedId)!.updatedAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!submitted ? (
                <>
                  <Pill color={timeLeft <= 60 ? 'red' : 'green'}>⏱ {mmss(timeLeft)}</Pill>
                  <button className="btn-primary" onClick={submit} disabled={!allAnswered}>Submit ({answers.filter((a) => a !== -1).length}/{quiz.questions.length})</button>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xl font-extrabold text-brand-600">{pct}%</span>
                  <Pill color={pct >= 70 ? 'green' : pct >= 50 ? 'amber' : 'red'}>{score}/{quiz.questions.length}</Pill>
                  <button className="btn-secondary !py-1 text-xs" onClick={() => startRetry({ title: quiz.title, questions: quiz.questions, answers }, true)} title="Re-quiz only the questions you got wrong">
                    🔁 Retry wrong
                  </button>
                  <button className="btn-secondary !py-1 text-xs" onClick={() => startRetry({ title: quiz.title, questions: quiz.questions, answers }, false)} title="Re-take the same quiz">
                    ↻ Same quiz
                  </button>
                  <button className="btn-ghost !py-1 text-xs text-red-500 hover:text-red-700" onClick={exitQuiz} title="Close quiz and return to the quiz home">
                    ✕ Exit quiz
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Question navigator — tap any number to jump there (works before AND after submit) */}
          <div className="flex flex-wrap gap-1.5">
            {quiz.questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                title={`Jump to question ${i + 1}`}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                  i === current ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                  : submitted
                    ? answers[i] === quiz.questions[i].answer
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : answers[i] !== -1
                        ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                    : answers[i] !== -1
                      ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                } hover:scale-105`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {submitted && (
            <p className="text-[11px] text-slate-400">Legend: <span className="text-green-600">green = correct</span> · <span className="text-red-500">red = wrong</span> · <span className="text-amber-500">amber = skipped</span></p>
          )}

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
              <button className="btn-secondary" onClick={startFresh}>＋ New Quiz</button>
              <button className="btn-primary" onClick={share}>📤 Share</button>
              <button className="btn-ghost !py-1 text-xs text-red-500 hover:text-red-700" onClick={exitQuiz}>✕ Exit</button>
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
              <label className="label">Number of questions (1–50)</label>
              <input
                type="number"
                min={1}
                max={50}
                className="input"
                value={count}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setCount(Math.min(50, Math.max(1, Math.round(v))));
                }}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[5, 10, 15, 20, 30, 50].map((n) => (
                  <button key={n} type="button" className={`rounded-full px-2.5 py-0.5 text-xs ${count === n ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={loading} onClick={() => { setSetupOpen(false); void start(); }}>
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
              <label className="label">Number of questions (max {bank.length})</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, bank.length)}
                className="input"
                value={bankCount}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setBankCount(Math.min(bank.length, Math.max(1, Math.round(v))));
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={startFromBank}>Start from bank</button>
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`📚 Saved quizzes (${savedQuizzes.length})`} wide>
        {savedQuizzes.length === 0 ? (
          <p className="text-sm text-slate-400">No quizzes saved yet. Submit a quiz and it will be stored here forever for review.</p>
        ) : (
          <div className="space-y-2">
            {savedQuizzes.map((q) => {
              const p = q.total ? Math.round((q.score / q.total) * 100) : 0;
              return (
                <div key={q.id} className="flex cursor-default items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700" {...ctxHandlers(showMenu, historyMenu(q))}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{q.title}</div>
                    <div className="text-xs text-slate-400">{q.date} · {q.total} questions · {Math.round(q.durationSeconds / 60)} min</div>
                  </div>
                  <Pill color={p >= 70 ? 'green' : p >= 50 ? 'amber' : 'red'}>{q.score}/{q.total} ({p}%)</Pill>
                  <button className="btn-secondary !py-1 text-xs" onClick={() => openHistory(q.id)}>Review</button>
                  <button className="btn-secondary !py-1 text-xs" onClick={() => startRetry(q, true)} title="Re-quiz only wrong answers">🔁 Wrong</button>
                  <button className="btn-secondary !py-1 text-xs" onClick={() => startRetry(q, false)} title="Re-take the same quiz">↻ Same</button>
                  <button className="btn-ghost !py-1 text-xs text-red-500" onClick={() => void deleteHistory(q.id)}>🗑</button>
                </div>
              );
            })}
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
                {answers[i] === q.answer ? <Pill color="green">Correct</Pill> : answers[i] === -1 ? <Pill color="amber">Skipped</Pill> : <Pill color="red">Wrong</Pill>}
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
