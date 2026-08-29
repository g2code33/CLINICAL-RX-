import { useEffect, useRef, useState } from 'react';
import { PageHeader, EmptyState } from '../components/ui';
import { useData, uid } from '../stores/data';
import { newChatSession } from '../services/defaults';
import { copyToClipboard } from '../services/export';
import { useContextMenu, ctxHandlers, type CtxItem } from '../components/ContextMenu';
import { AiThinking } from '../components/AiThinking';
import { runAiModule, aiReady, aiModuleLabel, analyzeLearning, generateQuestions, revisionCoach, organizeNote } from '../services/aiTools';
import type { AiModuleKey, RunOpts } from '../services/aiTools';
import type { ChatSession } from '../types';
import { useConfirm } from '../components/ui/primitives';

type Mode = 'chat' | 'explain' | 'analyze' | 'organize' | 'questions' | 'revision' | 'wardround';

const MODES: Array<{ key: Mode; icon: string; label: string; module: AiModuleKey; placeholder: string; auto?: boolean }> = [
  { key: 'chat', icon: '💬', label: 'Chat', module: 'chat', placeholder: 'Ask anything…' },
  { key: 'explain', icon: '🧑‍🏫', label: 'Explain', module: 'tutor', placeholder: 'e.g. Explain hypertension / how amlodipine works…' },
  { key: 'analyze', icon: '🩺', label: 'Analyze', module: 'analyzer', placeholder: 'Analyze my recent clinical learning', auto: true },
  { key: 'organize', icon: '📝', label: 'Organize', module: 'notes', placeholder: 'e.g. "Saw a patient with high BP on amlodipine, had FBC done…"' },
  { key: 'questions', icon: '❓', label: 'Questions', module: 'questionGen', placeholder: 'Focus (optional, e.g. antihypertensives) or leave blank → Enter' },
  { key: 'revision', icon: '📚', label: 'Revision', module: 'revision', placeholder: 'Generate my revision plan', auto: true },
  { key: 'wardround', icon: '🏥', label: 'Ward Round', module: 'wardRound', placeholder: 'Ask about a ward round, a patient case, medicines, clinical reasoning…' },
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
  const { confirm, confirmDialog } = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  // Busy state is PER SECTION — one AI working must never block another.
  const [busyBySection, setBusyBySection] = useState<Partial<Record<Mode, boolean>>>({});
  const [streaming, setStreaming] = useState<{ sessionId: string; text: string } | null>(null);
  const [parsedRecords, setParsedRecords] = useState<{ medicines: string[]; diseases: string[]; investigations: string[]; lessons: string[]; questions: string[] } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [listOpen, setListOpen] = useState(true); // hamburger: show/hide the chat list
  const [pendingImages, setPendingImages] = useState<string[]>([]); // images to attach
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const chats = useData((s) => s.chats);
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);
  const setStatus = useData((s) => s.setStatus);
  const showMenu = useContextMenu();

  function sessionMenu(s: ChatSession): CtxItem[] {
    return [
      { label: 'Open', icon: '💬', onClick: () => { setActiveId(s.id); setStreaming(null); } },
      { label: 'Rename', icon: '✏️', onClick: () => { setRenameId(s.id); setRenameVal(s.title || ''); } },
      { label: s.hidden ? 'Show' : 'Hide', icon: s.hidden ? '👁' : '🙈', onClick: () => void setHidden(s.id, !s.hidden) },
      { label: 'Share', icon: '📤', onClick: () => void shareSession(s.id) },
      { label: 'Delete', icon: '🗑', danger: true, onClick: () => void deleteSession(s.id) },
    ];
  }

  const sectionKey2: any = mode === 'wardround' ? 'wardRound' : mode;
    const sessions = chats.filter((c) => c.section === sectionKey2).sort((a, b) => b.updatedAt - a.updatedAt);
  const visibleSessions = sessions.filter((c) => showHidden || !c.hidden);
  const hiddenCount = sessions.filter((c) => c.hidden).length;
  const active = MODES.find((m) => m.key === mode)!;
  const currentSession = activeId ? chats.find((c) => c.id === activeId) ?? null : null;

  useEffect(() => {
    // Scroll to the LAST message whenever a chat is opened or a message lands.
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, streaming, busyBySection, activeId, currentSession?.messages.length]);

  useEffect(() => {
    setParsedRecords(null);
  }, [mode]);

  // Jump into a Ward Round AI session if signalled from ward rounds page.
  useEffect(() => {
    try {
      const sid = sessionStorage.getItem('crx:wardAiSession');
      if (!sid) return;
      sessionStorage.removeItem('crx:wardAiSession');
      const exists = useData.getState().chats.find((c) => c.id === sid);
      if (exists) {
        setMode('wardround');
        setActiveId(sid);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching section: keep the last-used session for that section if any.
  useEffect(() => {
    // The Ward Round AI section key is 'wardRound' (camelCase) in chats, but the mode tab is lowercase 'wardround'.
    const sectionKey: any = mode === 'wardround' ? 'wardRound' : mode;
    const list = chats.filter((c) => c.section === sectionKey);
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
    setPendingImages([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  /** Downscale an image data URL so stored chats stay small (max 1024px, JPEG). */
  async function downscaleImage(dataUrl: string, maxSize = 1024, quality = 0.8): Promise<string> {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('bad image')); img.src = dataUrl; });
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', quality);
    } catch {
      return dataUrl; // keep original if it can't be processed
    }
  }

  function onPickImages(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    for (const f of list) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;
        void downscaleImage(dataUrl).then((small) => {
          setPendingImages((p) => [...p, small].slice(0, 4)); // max 4 images per message
        });
      };
      reader.readAsDataURL(f);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function deleteSession(id: string) {
    const ok = await confirm({
      title: 'Delete this chat?',
      message: 'The conversation and its messages will be removed.',
      note: 'Your learning notes and clinical records are not affected.',
      confirmLabel: 'Delete chat',
      destructive: true,
    });
    if (!ok) return;
    await remove('chat', id);
    if (activeId === id) setActiveId(null);
  }

  async function setHidden(id: string, hidden: boolean) {
    const s = chats.find((c) => c.id === id);
    if (!s) return;
    await save('chat', { ...s, hidden, updatedAt: Date.now() });
  }

  async function renameSession(id: string, title: string) {
    const t = title.trim();
    const s = chats.find((c) => c.id === id);
    if (!s || !t) { setRenameId(null); return; }
    await save('chat', { ...s, title: t.slice(0, 60), updatedAt: Date.now() });
    setRenameId(null);
  }

  async function shareSession(id: string) {
    const s = chats.find((c) => c.id === id);
    if (!s) return;
    const lines = [
      `# 💊 CLINICAL Rx — ${s.title}`,
      `**Section:** ${active.label} · **Saved:** ${fmtTime(s.updatedAt)} · **Messages:** ${s.messages.length}`,
      '',
    ];
    for (const m of s.messages) {
      lines.push(`**${m.role === 'user' ? 'Student' : 'AI'}:** ${m.text}`);
      lines.push('');
    }
    await copyToClipboard(lines.join('\n'));
    setStatus(`✓ Chat "${s.title}" copied — paste it anywhere to share`);
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

  const thisBusy = !!busyBySection[mode];

  function setBusy(b: boolean) {
    setBusyBySection((prev) => ({ ...prev, [mode]: b }));
  }

  async function send(text?: string) {
    if (busyBySection[mode]) return;
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
      // Ward Round AI chats are stored under section 'wardRound' (camelCase) to match the module key.
      const sectionForSave: any = mode === 'wardround' ? 'wardRound' : mode;
      session = newChatSession(sectionForSave, title);
      await save('chat', session);
      setActiveId(session.id);
    }

    const now = Date.now();
    const userMsg = { id: uid(), role: 'user' as const, text: userText, ts: now, images: pendingImages.length ? [...pendingImages] : undefined };
    const afterUser: ChatSession = { ...session, messages: [...(session.messages ?? []), userMsg], updatedAt: now };
    await save('chat', afterUser);

    setInput('');
    setPendingImages([]);

    // Offline? Queue the task — it will complete automatically when the
    // network returns (and still shows in this chat as a "queued" note).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const { queueAiTask } = await import('../services/aiTaskQueue');
      queueAiTask({ section: moduleKey, mode, userText, sessionTitle: afterUser.title });
      await save('chat', { ...afterUser, messages: [...afterUser.messages, { id: uid(), role: 'ai' as const, text: '📡 You are offline — this task is queued and will run automatically when you reconnect.', ts: Date.now() }], updatedAt: Date.now() });
      setStatus("📡 Queued — will run when you're back online");
      return;
    }

    setBusy(true);
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
      ...(m.images?.length ? { images: m.images } : {}),
    }));
    const opts: RunOpts = {
      history,
      images: pendingImages.length ? [...pendingImages] : undefined,
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
      } else if (mode === 'wardround') {
        // Extra context for ward round chat: if the session is tied to a round/patient, pull the full digest.
        let wardCtx = '';
        try {
          const { buildRoundAiContext } = await import('../services/wardAi');
          const m = /\[wr:([^:]+)(?::([^\]]+))?\]/.exec(afterUser.title || '');
          if (m) wardCtx = buildRoundAiContext(m[1], m[2] || null);
        } catch { /* ignore */ }
        const sysExtra = wardCtx
          ? `You are in the dedicated Ward Round AI teacher mode. The student has a specific round (and optionally patient) loaded below. Use that data heavily — connect medicines to class/mechanism/counselling, conditions to pathophys, investigations to interpretation, and flag knowledge gaps. Be educational, never give patient-specific treatment directives; remind to verify with supervisor/formulary when it matters. Use headings and bullets.

LOADED ROUND DATA:
${wardCtx}`
          : '';
        res = await runAiModule(moduleKey, prompt, sysExtra, opts);
      } else {
        res = await runAiModule(moduleKey, prompt, '', opts);
      }
    } catch (e: any) {
      res = { ok: false as const, error: e?.message || 'Something went wrong. Please try again.' };
    }

    setBusy(false);
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
      {confirmDialog}
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

      <div className="relative flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* Session list for this section — hamburger ☰ toggles it.
            On mobile it slides over the chat as a drawer. */}
        {!listOpen ? (
          <button
            className="flex h-fit shrink-0 flex-col items-center gap-1 self-start rounded-lg border border-slate-200 px-2.5 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
            onClick={() => setListOpen(true)}
            title="Show chat list"
          >
            <span>☰</span>
            <span className="text-[10px] text-slate-400">{sessions.length}</span>
          </button>
        ) : (
        <>
        {listOpen && (
          <div className="absolute inset-0 z-20 bg-slate-900/30 md:hidden" onClick={() => setListOpen(false)} />
        )}
        <div className="absolute inset-y-0 left-0 z-30 flex w-64 max-w-[80vw] flex-col bg-white p-1.5 text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100 md:static md:z-auto md:w-60 md:shrink-0 md:p-0 md:shadow-none">
          <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-slate-400">
            <div className="flex items-center gap-1">
              <button className="btn-ghost !p-0 text-sm" onClick={() => setListOpen(false)} title="Hide chat list">☰</button>
              <span>{active.label} chats ({sessions.length})</span>
            </div>
            {hiddenCount > 0 && (
              <button className="btn-ghost !p-0 text-[11px] text-brand-600 dark:text-brand-400" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? '🙈 Hide hidden' : `👁 Show hidden (${hiddenCount})`}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
            {visibleSessions.length === 0 && (
              <p className="p-2 text-xs text-slate-400">{hiddenCount ? 'All chats hidden — tap "Show hidden" to bring them back.' : 'No chats yet. Start one below.'}</p>
            )}
            {visibleSessions.map((s) => (
              <div key={s.id}>
                {renameId === s.id ? (
                  <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-700">
                    <input
                      className="input !px-1.5 !py-0.5 text-xs"
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void renameSession(s.id, renameVal); if (e.key === 'Escape') setRenameId(null); }}
                      onBlur={() => void renameSession(s.id, renameVal)}
                      placeholder="New title…"
                    />
                  </div>
                ) : (
                  <div
                    className={`group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs ${s.id === activeId ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} ${s.hidden ? 'opacity-50' : ''}`}
                    onClick={() => { setActiveId(s.id); setStreaming(null); }}
                    {...ctxHandlers(showMenu, sessionMenu(s))}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s.hidden && '🙈 '}{(s.title || 'Untitled').replace(/^\[[^\]]+\]\s*/, '')}
                      <span className={`ml-1 opacity-60 ${s.id === activeId ? 'text-white' : 'text-slate-400'}`}>{s.messages.length} msgs · {fmtTime(s.updatedAt)}</span>
                    </span>
                    <button
                      className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title={s.hidden ? 'Show chat' : 'Hide chat'}
                      onClick={(e) => { e.stopPropagation(); void setHidden(s.id, !s.hidden); }}
                    >{s.hidden ? '👁' : '🙈'}</button>
                    <button
                      className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title="Rename chat"
                      onClick={(e) => { e.stopPropagation(); setRenameId(s.id); setRenameVal(s.title || ''); }}
                    >✏️</button>
                    <button
                      className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title="Share chat (copy)"
                      onClick={(e) => { e.stopPropagation(); void shareSession(s.id); }}
                    >📤</button>
                    <button
                      className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
                      title="Delete chat"
                      onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                    >🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        </>
        )}

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
                    {m.images && m.images.length > 0 && (
                      <div className={`mb-2 flex flex-wrap gap-1.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
                        {m.images.map((u, ui) => (
                          <img key={ui} src={u} alt="attached" className="h-24 w-24 rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}
              {thisBusy && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[92%]">
                    <AiThinking
                      moduleLabel={aiModuleLabel(active.module)}
                      live={showStreaming ? streaming.text : undefined}
                      detail={showStreaming ? undefined : `Working on: ${currentSession?.title || active.placeholder}`}
                    />
                  </div>
                </div>
              )}
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

          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-200 p-2 dark:border-slate-700">
              {pendingImages.map((u, i) => (
                <div key={i} className="relative">
                  <img src={u} alt={`attach ${i + 1}`} className="h-14 w-14 rounded-lg object-cover" />
                  <button
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white"
                    onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                    title="Remove image"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPickImages(e.target.files)}
            />
            <button
              className="btn-ghost !px-2 !py-1 text-lg"
              onClick={() => fileRef.current?.click()}
              title="Attach image(s)"
              disabled={thisBusy || pendingImages.length >= 4}
            >🖼</button>
            <input
              ref={inputRef}
              className="input flex-1"
              placeholder={active.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !thisBusy && void send()}
              disabled={thisBusy}
            />
            {active.auto ? (
              <button className="btn-primary" onClick={() => void send()} disabled={thisBusy} title={active.auto ? 'Run now' : 'Send'}>
                {thisBusy ? '…' : '▶ Run'}
              </button>
            ) : (
              <button className="btn-primary" onClick={() => void send()} disabled={thisBusy} title="Send">
                {thisBusy ? '…' : '➤'}
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
