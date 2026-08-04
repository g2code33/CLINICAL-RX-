import { useEffect, useRef, useState } from 'react';
import { PageHeader, EmptyState } from '../components/ui';
import { useData, uid } from '../stores/data';
import { newChatSession } from '../services/defaults';
import { runAiModule, aiReady, aiModuleLabel, analyzeLearning, generateQuestions, revisionCoach, organizeNote } from '../services/aiTools';
import type { AiModuleKey, RunOpts } from '../services/aiTools';
import type { ChatSession } from '../types';

type Mode = 'chat' | 'explain' | 'analyze' | 'organize' | 'questions' | 'revision';

const MODES: Array<{ key: Mode; icon: string; label: string; module: AiModuleKey; placeholder: string; auto?: boolean }> = [
  { key: 'chat', icon: '💬', label: 'Chat', module: 'chat', placeholder: 'Ask anything…' },
  { key: 'explain', icon: '🧑‍🏫', label: 'Explain', module: 'tutor', placeholder: 'e.g. Explain hypertension / how amlodipine works…' },
  { key: 'analyze', icon: '🩺', label: 'Analyze', module: 'analyzer', placeholder: 'Analyze my recent clinical learning', auto: true },
  { key: 'organize', icon: '📝', label: 'Organize', module: 'notes', placeholder: 'e.g. "Saw a patient with high BP on amlodipine, had FBC done…"' },
  { key: 'questions', icon: '❓', label: 'Questions', module: 'questionGen', placeholder: 'Focus (optional, e.g. antihypertensives) or leave blank → Enter' },
  { key: 'revision', icon: '📚', label: 'Revision', module: 'revision', placeholder: 'Generate my revision plan', auto: true },
];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

export function AiChat() {
  const [mode, setMode] = useState<Mode>('chat');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState<{ sessionId: string; text: string } | null>(null);
  const [parsedRecords, setParsedRecords] = useState<{ medicines: string[]; diseases: string[]; investigations: string[]; lessons: string[]; questions: string[] } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chats = useData((s) => s.chats);
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);

  const sessions = chats.filter((c) => c.section === mode).sort((a, b) => b.updatedAt - a.updatedAt);
  const active = MODES.find((m) => m.key === mode)!;
  const currentSession = activeId ? chats.find((c) => c.id === activeId) ?? null : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, streaming, thinking]);

  useEffect(() => {
    setParsedRecords(null);
  }, [mode]);

  // Switching section: keep the last-used session for that section if any.
  useEffect(() => {
    const list = chats.filter((c) => c.section === mode);
    if (list.length) setActiveId(list[0].id);
    else setActiveId(null);
    setInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function newChat() {
    setActiveId(null);
    setInput('');
    setStreaming(null);
    setParsedRecords(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this chat? This cannot be undone.')) return;
    await remove('chat', id);
    if (activeId === id) setActiveId(null);
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

  async function send(text?: string) {
    if (thinking) return;
    const moduleKey = active.module;
    if (!aiReady(moduleKey)) {
      setMsgsInline(`⚠️ ${aiModuleLabel(moduleKey)} isn't ready. Add an API key (and enable it) in Settings → AI.`);
      return;
    }
    const prompt = (text ?? input).trim();
    if (!active.auto && !prompt) return;
    const userText = active.auto ? (prompt || active.placeholder) : prompt;

    // Create a session on the first message of a new chat.
    let session: ChatSession = currentSession!;
    if (!session) {
      const title = userText.replace(/\s+/g, ' ').slice(0, 48) || active.label;
      session = newChatSession(mode, title);
      await save('chat', session);
      setActiveId(session.id);
    }

    const now = Date.now();
    const userMsg = { id: uid(), role: 'user' as const, text: userText, ts: now };
    const afterUser: ChatSession = { ...session, messages: [...(session.messages ?? []), userMsg], updatedAt: now };
    await save('chat', afterUser);

    setInput('');
    setThinking(true);
    setParsedRecords(null);
    const streamSessionId = afterUser.id;
    setStreaming({ sessionId: streamSessionId, text: '' });

    // History = this session's messages so far, excluding the message we're
    // about to send (it is passed as `user`), capped to the last 12 so long
    // threads stay within the model's context window. Cross-section memory is
    // injected by runAiModule via buildMemoryContext (excludes this session).
    const history = afterUser.messages.slice(-13, -1).map((m) => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: m.text,
    }));
    const opts: RunOpts = {
      history,
      excludeSessionId: afterUser.id,
      onToken: (t) => setStreaming((s) => (s ? { sessionId: s.sessionId, text: s.text + t } : { sessionId: streamSessionId, text: t })),
    };

    let res;
    try {
      if (mode === 'analyze') res = await analyzeLearning(opts);
      else if (mode === 'questions') res = await generateQuestions(prompt || undefined, 5, opts);
      else if (mode === 'revision') res = await revisionCoach(opts);
      else if (mode === 'organize') {
        res = await organizeNote(prompt, opts);
        if (res.ok) setParsedRecords(extractStructured(res.text));
      } else {
        res = await runAiModule(moduleKey, prompt, '', opts);
      }
    } catch (e: any) {
      res = { ok: false as const, error: e?.message || 'Something went wrong. Please try again.' };
    }

    setThinking(false);
    setStreaming(null);

    const aiText = res.ok ? res.text : '⚠️ ' + res.error;
    const aiMsg = { id: uid(), role: 'ai' as const, text: aiText, ts: Date.now() };
    const final: ChatSession = { ...afterUser, messages: [...afterUser.messages, aiMsg], updatedAt: Date.now() };
    await save('chat', final);
  }

  function setMsgsInline(text: string) {
    // Persist a notice (e.g. module not ready) into the current session, or a
    // fresh session if none exists yet.
    const base: ChatSession = currentSession ?? newChatSession(mode, active.label);
    const aiMsg = { id: uid(), role: 'ai' as const, text, ts: Date.now() };
    void save('chat', { ...base, messages: [...(base.messages ?? []), aiMsg], updatedAt: Date.now() });
    if (!currentSession) setActiveId(base.id);
  }

  async function saveOrganized() {
    if (!parsedRecords) return;
    const state = useData.getState();
    const saveRec = state.save;
    const existing = state.days.find((d) => d.date === new Date().toISOString().slice(0, 10));
    const day = existing ? { ...existing, conditions: [...existing.conditions], medicines: [...existing.medicines], investigations: [...existing.investigations], lessons: [...existing.lessons] } : null;
    const saved: string[] = [];

    const newDisease = (await import('../services/defaults')).newDisease;
    const newMedicine = (await import('../services/defaults')).newMedicine;
    const newInvestigation = (await import('../services/defaults')).newInvestigation;
    const newQuestion = (await import('../services/defaults')).newQuestion;
    const todayIso = (await import('../services/defaults')).todayIso;

    for (const name of parsedRecords.diseases) {
      if (!name.trim()) continue;
      await saveRec('disease', newDisease(name));
      if (day && !day.conditions.includes(name)) day.conditions.push(name);
      saved.push('🦠 ' + name);
    }
    for (const name of parsedRecords.medicines) {
      if (!name.trim()) continue;
      await saveRec('medicine', newMedicine(name));
      if (day && !day.medicines.includes(name)) day.medicines.push(name);
      saved.push('💊 ' + name);
    }
    for (const name of parsedRecords.investigations) {
      if (!name.trim()) continue;
      await saveRec('investigation', newInvestigation(name));
      if (day && !day.investigations.includes(name)) day.investigations.push(name);
      saved.push('🧪 ' + name);
    }
    for (const text of parsedRecords.lessons) {
      if (!text.trim()) continue;
      await saveRec('lesson', {
        id: uid(), createdAt: Date.now(), updatedAt: Date.now(), title: text, content: text, date: todayIso(), important: false,
      });
      if (day && !day.lessons.includes(text)) day.lessons.push(text);
      saved.push('💡 ' + text);
    }
    for (const text of parsedRecords.questions) {
      if (!text.trim()) continue;
      await saveRec('question', newQuestion(text));
      saved.push('❓ ' + text);
    }
    if (day && (parsedRecords.diseases.length || parsedRecords.medicines.length || parsedRecords.investigations.length || parsedRecords.lessons.length)) {
      day.updatedAt = Date.now();
      await saveRec('day', day);
    }
    setParsedRecords(null);
    setMsgsInline(saved.length ? `✓ Saved ${saved.length} record(s):\n${saved.join('\n')}` : 'Nothing to save.');
  }

  const showStreaming = streaming && streaming.sessionId === currentSession?.id;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Ask Clinical AI"
        subtitle="Each section is independent with its own saved chats — but every section remembers your other conversations across the app."
        action={<button className="btn-primary" onClick={newChat}>＋ New chat</button>}
      />

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

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* Session list for this section */}
        <div className="flex min-h-0 w-full flex-col md:w-60 md:shrink-0">
          <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-slate-400">
            <span>{active.label} chats ({sessions.length})</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
            {sessions.length === 0 && (
              <p className="p-2 text-xs text-slate-400">No chats yet. Start one below.</p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs ${s.id === activeId ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                onClick={() => { setActiveId(s.id); setStreaming(null); }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {s.title || 'Untitled'}
                  <span className={`ml-1 opacity-60 ${s.id === activeId ? 'text-white' : 'text-slate-400'}`}>{s.messages.length} msgs · {fmtTime(s.updatedAt)}</span>
                </span>
                <button
                  className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
                  title="Delete chat"
                  onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                >🗑</button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="card flex min-h-0 min-w-0 flex-1 flex-col">
          {!currentSession && !streaming ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-4xl">{active.icon}</div>
              <div className="text-sm font-semibold">{active.label} · {aiModuleLabel(active.module)}</div>
              <p className="max-w-md text-xs text-slate-400">{active.placeholder}</p>
              {active.auto ? (
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => void send()}>
                  ▶ Run now
                </button>
              ) : (
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => inputRef.current?.focus()}>
                  ✍️ Start typing
                </button>
              )}
              <p className="text-[11px] text-slate-400">Conversations are saved automatically. All sections share memory of your other chats.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {(currentSession?.messages ?? []).map((m, i) => (
                <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {showStreaming && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-4 py-2.5 text-sm dark:bg-slate-700">
                    {streaming.text}
                    <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-middle" />
                  </div>
                </div>
              )}
              {thinking && !showStreaming && <div className="text-sm text-slate-400 animate-pulse">🤖 {aiModuleLabel(active.module)} is thinking…</div>}
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
                <button className="btn-primary !py-1 text-xs" onClick={() => void saveOrganized()}>✓ Save to Clinical Rx</button>
              </div>
            </div>
          )}

          <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <input
              ref={inputRef}
              className="input flex-1"
              placeholder={active.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !thinking && void send()}
              disabled={thinking}
            />
            {active.auto ? (
              <button className="btn-primary" onClick={() => void send()} disabled={thinking} title={active.auto ? 'Run now' : 'Send'}>
                {thinking ? '…' : '▶ Run'}
              </button>
            ) : (
              <button className="btn-primary" onClick={() => void send()} disabled={thinking} title="Send">
                {thinking ? '…' : '➤'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export for use in other pages that want the same tooling without a big import chain.
export { EmptyState };
