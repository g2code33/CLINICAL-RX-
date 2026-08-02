import { useState, useRef, useEffect } from 'react';
import { PageHeader, EmptyState } from '../components/ui';
import { useData } from '../stores/data';
import { newDisease, newMedicine, newInvestigation, newQuestion, todayIso } from '../services/defaults';
import { runAiModule, aiReady, aiModuleLabel, analyzeLearning, generateQuestions, revisionCoach, organizeNote } from '../services/aiTools';
import type { AiModuleKey } from '../services/aiTools';

type Mode = 'chat' | 'explain' | 'analyze' | 'organize' | 'questions' | 'revision';

const MODES: Array<{ key: Mode; icon: string; label: string; module: AiModuleKey; placeholder: string; auto?: boolean }> = [
  { key: 'chat', icon: '💬', label: 'Chat', module: 'chat', placeholder: 'Ask anything…' },
  { key: 'explain', icon: '🧑‍🏫', label: 'Explain', module: 'tutor', placeholder: 'e.g. Explain hypertension / how amlodipine works…' },
  { key: 'analyze', icon: '🩺', label: 'Analyze', module: 'analyzer', placeholder: 'Analyze my recent clinical learning', auto: true },
  { key: 'organize', icon: '📝', label: 'Organize', module: 'notes', placeholder: 'e.g. "Saw a patient with high BP on amlodipine, had FBC done…"' },
  { key: 'questions', icon: '❓', label: 'Questions', module: 'questionGen', placeholder: 'Focus (optional, e.g. antihypertensives) or leave blank → Enter' },
  { key: 'revision', icon: '📚', label: 'Revision', module: 'revision', placeholder: 'Generate my revision plan', auto: true },
];

interface Msg { role: 'user' | 'ai'; text: string; }

export function AiChat() {
  const [mode, setMode] = useState<Mode>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<{ medicines: string[]; diseases: string[]; investigations: string[]; lessons: string[]; questions: string[] } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, thinking]);

  useEffect(() => {
    setParsedRecords(null);
  }, [mode]);

  const active = MODES.find((m) => m.key === mode)!;

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (thinking) return;
    const moduleKey = active.module;
    if (!aiReady(moduleKey)) {
      setMsgs((m) => [...m, { role: 'ai', text: `⚠️ ${aiModuleLabel(moduleKey)} isn't ready. Add an API key (and enable it) in Settings → AI.` }]);
      return;
    }
    if (!active.auto && !prompt) return;
    setMsgs((m) => [...m, { role: 'user', text: prompt || `(${active.label})` }]);
    setInput('');
    setThinking(true);
    setParsedRecords(null);

    let res;
    if (mode === 'analyze') res = await analyzeLearning();
    else if (mode === 'questions') res = await generateQuestions(prompt || undefined);
    else if (mode === 'revision') res = await revisionCoach();
    else if (mode === 'organize') {
      res = await organizeNote(prompt);
      if (res.ok) setParsedRecords(extractStructured(res.text));
    } else {
      res = await runAiModule(moduleKey, prompt);
    }

    setThinking(false);
    if (res.ok) {
      setMsgs((m) => [...m, { role: 'ai', text: res.text }]);
    } else {
      setMsgs((m) => [...m, { role: 'ai', text: '⚠️ ' + res.error }]);
    }
  }

  function extractStructured(text: string): { medicines: string[]; diseases: string[]; investigations: string[]; lessons: string[]; questions: string[] } {
    const empty = { medicines: [], diseases: [], investigations: [], lessons: [], questions: [] };
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) return empty;
      const parsed = JSON.parse(text.slice(start, end + 1));
      return {
        medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
        diseases: Array.isArray(parsed.diseases) ? parsed.diseases : [],
        investigations: Array.isArray(parsed.investigations) ? parsed.investigations : [],
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      };
    } catch {
      return empty;
    }
  }

  async function saveOrganized() {
    if (!parsedRecords) return;
    const state = useData.getState();
    const save = state.save;
    const day = state.days.find((d) => d.date === todayIso());
    const saved: string[] = [];

    for (const name of parsedRecords.diseases) {
      if (!name.trim()) continue;
      const d = newDisease(name);
      await save('disease', d);
      if (day && !day.conditions.includes(name)) day.conditions.push(name);
      saved.push('🦠 ' + name);
    }
    for (const name of parsedRecords.medicines) {
      if (!name.trim()) continue;
      const m = newMedicine(name);
      await save('medicine', m);
      if (day && !day.medicines.includes(name)) day.medicines.push(name);
      saved.push('💊 ' + name);
    }
    for (const name of parsedRecords.investigations) {
      if (!name.trim()) continue;
      const i = newInvestigation(name);
      await save('investigation', i);
      if (day && !day.investigations.includes(name)) day.investigations.push(name);
      saved.push('🧪 ' + name);
    }
    for (const text of parsedRecords.lessons) {
      if (!text.trim()) continue;
      await save('lesson', {
        id: crypto.randomUUID ? crypto.randomUUID() : 'l' + Date.now(),
        createdAt: Date.now(), updatedAt: Date.now(), title: text, content: text, date: todayIso(), important: false,
      });
      if (day && !day.lessons.includes(text)) day.lessons.push(text);
      saved.push('💡 ' + text);
    }
    for (const text of parsedRecords.questions) {
      if (!text.trim()) continue;
      await save('question', newQuestion(text));
      saved.push('❓ ' + text);
    }
    if (day && (parsedRecords.diseases.length || parsedRecords.medicines.length || parsedRecords.investigations.length || parsedRecords.lessons.length)) {
      day.updatedAt = Date.now();
      await save('day', { ...day });
    }
    setParsedRecords(null);
    setMsgs((m) => [...m, { role: 'ai', text: saved.length ? `✓ Saved ${saved.length} record(s):\n${saved.join('\n')}` : 'Nothing to save.' }]);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ask Clinical AI" subtitle="Each mode uses its own configured AI module (Settings → AI)." />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${mode === m.key ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}`}
            title={aiModuleLabel(m.module)}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <div className="card flex min-h-0 flex-1 flex-col">
        {msgs.length === 0 ? (
          <div className="flex-1 space-y-2 p-4">
            <p className="mb-2 text-sm text-slate-500">Mode: <span className="font-semibold">{active.label}</span> · uses {aiModuleLabel(active.module)}</p>
            {active.auto ? (
              <button className="block w-full rounded-lg bg-brand-600 px-3 py-3 text-left text-sm font-semibold text-white hover:bg-brand-700" onClick={() => send()}>
                {active.icon} {active.label === 'Analyze' ? 'Analyze my learning now' : active.label === 'Revision' ? 'Generate my revision plan now' : 'Run'}
              </button>
            ) : (
              <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-700 dark:text-slate-300">{active.placeholder}</p>
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && <div className="text-sm text-slate-400 animate-pulse">🤖 {aiModuleLabel(active.module)} is thinking…</div>}
            <div ref={bottomRef} />
          </div>
        )}

        {parsedRecords && (
          <div className="border-t border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 text-xs font-semibold text-slate-500">Detected from your note — review before saving:</div>
            <div className="flex flex-wrap gap-1.5">
              {parsedRecords.diseases.map((x) => <span key={x} className="rounded bg-brand-50 px-2 py-0.5 text-xs dark:bg-brand-900">🦠 {x}</span>)}
              {parsedRecords.medicines.map((x) => <span key={x} className="rounded bg-sky-50 px-2 py-0.5 text-xs dark:bg-sky-900">💊 {x}</span>)}
              {parsedRecords.investigations.map((x) => <span key={x} className="rounded bg-violet-50 px-2 py-0.5 text-xs dark:bg-violet-900">🧪 {x}</span>)}
              {parsedRecords.lessons.map((x) => <span key={x} className="rounded bg-amber-50 px-2 py-0.5 text-xs dark:bg-amber-900">💡 {x}</span>)}
              {parsedRecords.questions.map((x) => <span key={x} className="rounded bg-red-50 px-2 py-0.5 text-xs dark:bg-red-900">❓ {x}</span>)}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button className="btn-secondary !py-1 text-xs" onClick={() => setParsedRecords(null)}>Discard</button>
              <button className="btn-primary !py-1 text-xs" onClick={saveOrganized}>✓ Save to Clinical Rx</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
          <input
            className="input flex-1"
            placeholder={active.placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={thinking || active.auto}
          />
          <button className="btn-primary" onClick={() => send()} disabled={thinking || (active.auto && msgs.length > 0 && !parsedRecords)}>➤</button>
        </div>
      </div>
    </div>
  );
}

// Re-export for use in other pages that want the same tooling without a big import chain.
export { EmptyState };
