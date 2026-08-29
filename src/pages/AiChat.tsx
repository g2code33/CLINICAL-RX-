import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, EmptyState } from '../components/ui';
import { useData, uid } from '../stores/data';
import { newChatSession } from '../services/defaults';
import { copyToClipboard } from '../services/export';
import { useContextMenu, ctxHandlers, type CtxItem } from '../components/ContextMenu';
import { AiThinking } from '../components/AiThinking';
import { runAiModule, aiReady, aiModuleLabel, analyzeLearning, generateQuestions, revisionCoach, organizeNote } from '../services/aiTools';
import type { AiModuleKey, RunOpts } from '../services/aiTools';
import type { ChatSession, WardRound, WardEntry } from '../types';
import { useConfirm } from '../components/ui/primitives';

/** Logical groups for the AI mode strip so the 11 tabs don't feel scattered. */
type ModeGroup = 'assistants' | 'tools' | 'special';
type Mode =
  | 'general'
  | 'clinical'
  | 'revision'
  | 'search'
  | 'bundler'
  | 'career'
  | 'research'
  | 'analyze'
  | 'organize'
  | 'questions'
  | 'wardround';

interface ModeDef {
  key: Mode;
  icon: string;
  label: string;
  group: ModeGroup;
  module: AiModuleKey;
  placeholder: string;
  auto?: boolean;
  hint?: string;
}

const MODES: ModeDef[] = [
  // ——— Everyday AI assistants (the 7 original personas, restored) ———
  { key: 'general',  icon: '🤖', label: 'General',      group: 'assistants', module: 'chat',       placeholder: 'Ask anything — study, app questions, quick explanations…' },
  { key: 'clinical', icon: '🩺', label: 'Clinical',     group: 'assistants', module: 'tutor',      placeholder: 'e.g. Explain hypertension, how amlodipine works, an investigation…', hint: 'Disease / medicine / investigation explainer with WHO→WHAT→WHERE→WHY→HOW→DT' },
  { key: 'revision', icon: '📚', label: 'Revision',     group: 'assistants', module: 'revision',   placeholder: 'Generate my revision plan', auto: true, hint: 'Spaced-repetition revision coach' },
  { key: 'search',   icon: '🔎', label: 'Search',       group: 'assistants', module: 'search',     placeholder: 'Search my saved records — diseases, meds, notes, rounds…', hint: 'Answers strictly from YOUR saved records' },
  { key: 'bundler',  icon: '📦', label: 'Bundler',      group: 'assistants', module: 'bundler',    placeholder: 'Summarise a day/week of learning, find gaps and revision priorities', auto: true },
  { key: 'career',   icon: '🎓', label: 'Career',       group: 'assistants', module: 'career',     placeholder: 'CV help, interview prep, rotation reflection, goals…' },
  { key: 'research', icon: '🔬', label: 'Research',     group: 'assistants', module: 'research',   placeholder: 'Form a research question, plan a study, organise reading…' },
  // ——— Productivity / study tools ———
  { key: 'analyze',  icon: '📊', label: 'Analyze',      group: 'tools',      module: 'analyzer',   placeholder: 'Analyze my recent clinical learning', auto: true },
  { key: 'organize', icon: '📝', label: 'Organize',     group: 'tools',      module: 'notes',      placeholder: 'Turn a rough note into structured records (e.g. "Saw a patient with high BP…")' },
  { key: 'questions',icon: '❓', label: 'Questions',    group: 'tools',      module: 'questionGen',placeholder: 'Focus (optional, e.g. antihypertensives) or leave blank → Enter' },
  // ——— Deep, dedicated mode ———
  { key: 'wardround',icon: '🏥', label: 'Ward Round',   group: 'special',    module: 'wardRound',  placeholder: 'Pick a round/patient (🏥 button), then ask anything — meds, reasoning, quizzes…', hint: 'Deep ward-round teacher — pick a round and patient for a case-specific chat' },
];

const GROUP_LABEL: Record<ModeGroup, string> = {
  assistants: 'Assistants',
  tools: 'Study tools',
  special: 'Deep modes',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

export function AiChat() {
  const [search, setSearch] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => {
    const m = search.get('m');
    const legacy: Record<string, Mode> = {
      general: 'general', chat: 'general',
      clinical: 'clinical', tutor: 'clinical', explain: 'clinical',
      revision: 'revision',
      search: 'search',
      bundler: 'bundler',
      career: 'career',
      research: 'research',
      analyze: 'analyze', analyzer: 'analyze',
      organize: 'organize', notes: 'organize',
      questions: 'questions', questionGen: 'questions',
      wardround: 'wardround', wardRound: 'wardround',
    };
    return (m && legacy[m]) || 'general';
  });
  const { confirm, confirmDialog } = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busyBySection, setBusyBySection] = useState<Partial<Record<Mode, boolean>>>({});
  const [streaming, setStreaming] = useState<{ sessionId: string; text: string } | null>(null);
  const [parsedRecords, setParsedRecords] = useState<{ medicines: string[]; diseases: string[]; investigations: string[]; lessons: string[]; questions: string[] } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [listOpen, setListOpen] = useState(true);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ward Round AI picker state (visible from the typing bar).
  const [wardPickerOpen, setWardPickerOpen] = useState(false);

  const chats = useData((s) => s.chats);
  const wardRounds = useData((s) => s.wardRounds);
  const wardEntries = useData((s) => s.wardEntries);
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

  const active = MODES.find((m) => m.key === mode)!;
  const sectionKey: AiModuleKey = active.module;
  const sessions = chats.filter((c) => c.section === sectionKey).sort((a, b) => b.updatedAt - a.updatedAt);
  const visibleSessions = sessions.filter((c) => showHidden || !c.hidden);
  const hiddenCount = sessions.filter((c) => c.hidden).length;
  const currentSession = activeId ? chats.find((c) => c.id === activeId) ?? null : null;

  // Ward Round attachment: resolve from current session title (keyed [wr:roundId:patient]).
  const wardAttachment: { roundId: string; patientLabel: string | null; round?: WardRound } | null = (() => {
    if (mode !== 'wardround' || !currentSession) return null;
    const m = /\[wr:([^:]+)(?::([^\]]+))?\]/.exec(currentSession.title || '');
    if (!m) return null;
    const roundId = m[1];
    const patientLabel = m[2] || null;
    const r = wardRounds.find((x) => x.id === roundId);
    return { roundId, patientLabel, round: r };
  })();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, streaming, busyBySection, activeId, currentSession?.messages.length]);

  useEffect(() => {
    setParsedRecords(null);
    setWardPickerOpen(false);
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

  // Honour ?q=... deep-link prompt.
  useEffect(() => {
    const q = search.get('q');
    if (!q) return;
    setSearch({}, { replace: true });
    setInput(q);
    const t = setTimeout(() => { void send(q); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching section: keep the last-used session for that section if any.
  useEffect(() => {
    const list = chats.filter((c) => c.section === active.module);
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
    } catch { return dataUrl; }
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
          setPendingImages((p) => [...p, small].slice(0, 4));
        });
      };
      reader.readAsDataURL(f);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function deleteSession(id: string) {
    const ok = await confirm({
      title: 'Delete this chat?', message: 'The conversation and its messages will be removed.',
      note: 'Your learning notes and clinical records are not affected.',
      confirmLabel: 'Delete chat', destructive: true,
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
    // Preserve internal [wr:...] prefix when renaming Ward Round sessions.
    const prefix = /^(\[[^\]]+\]\s*)/.exec(s.title || '')?.[1] || '';
    const cleanTitle = t.replace(/^\[[^\]]+\]\s*/, '');
    await save('chat', { ...s, title: prefix + cleanTitle.slice(0, 60), updatedAt: Date.now() });
    setRenameId(null);
  }

  async function shareSession(id: string) {
    const s = chats.find((c) => c.id === id);
    if (!s) return;
    const lines = [
      `# 💊 CLINICAL Rx — ${s.title.replace(/^\[[^\]]+\]\s*/, '')}`,
      `**Section:** ${active.label} · **Saved:** ${fmtTime(s.updatedAt)} · **Messages:** ${s.messages.length}`,
      '',
    ];
    for (const m of s.messages) {
      lines.push(`**${m.role === 'user' ? 'Student' : 'AI'}:** ${m.text}`);
      lines.push('');
    }
    await copyToClipboard(lines.join('\n'));
    setStatus(`✓ Chat "${s.title.replace(/^\[[^\]]+\]\s*/, '')}" copied — paste it anywhere to share`);
  }

  function extractStructured(text: string): { medicines: string[]; diseases: string[]; investigations: string[]; lessons: string[]; questions: string[] } {
    const empty = { medicines: [], diseases: [], investigations: [], lessons: [], questions: [] };
    try {
      const start = text.indexOf('{'); const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) return empty;
      const parsed = JSON.parse(text.slice(start, end + 1));
      return {
        medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
        diseases: Array.isArray(parsed.diseases) ? parsed.diseases : [],
        investigations: Array.isArray(parsed.investigations) ? parsed.investigations : [],
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      };
    } catch { return empty; }
  }

  const thisBusy = !!busyBySection[mode];
  function setBusy(b: boolean) { setBusyBySection((prev) => ({ ...prev, [mode]: b })); }

  async function send(text?: string) {
    if (busyBySection[mode]) return;
    if (!aiReady(sectionKey)) {
      setMsgsInline(`⚠️ ${aiModuleLabel(sectionKey)} isn't ready. Add an API key (and enable it) in Settings → AI.`);
      return;
    }
    const prompt = (text ?? input).trim();
    if (!active.auto && !prompt) return;
    const userText = active.auto ? (prompt || active.placeholder) : prompt;

    let session: ChatSession = currentSession!;
    if (!session) {
      const title = userText.replace(/\s+/g, ' ').slice(0, 48) || active.label;
      session = newChatSession(sectionKey, title);
      await save('chat', session);
      setActiveId(session.id);
    }

    const now = Date.now();
    const userMsg = { id: uid(), role: 'user' as const, text: userText, ts: now, images: pendingImages.length ? [...pendingImages] : undefined };
    const afterUser: ChatSession = { ...session, messages: [...(session.messages ?? []), userMsg], updatedAt: now };
    await save('chat', afterUser);

    setInput('');
    setPendingImages([]);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const { queueAiTask } = await import('../services/aiTaskQueue');
      queueAiTask({ section: sectionKey, mode, userText, sessionTitle: afterUser.title });
      await save('chat', { ...afterUser, messages: [...afterUser.messages, { id: uid(), role: 'ai' as const, text: '📡 You are offline — this task is queued and will run automatically when you reconnect.', ts: Date.now() }], updatedAt: Date.now() });
      setStatus("📡 Queued — will run when you're back online");
      return;
    }

    setBusy(true);
    setParsedRecords(null);
    const streamSessionId = afterUser.id;
    setStreaming({ sessionId: streamSessionId, text: '' });

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
        let wardCtx = ''; let wardHint = '';
        try {
          const { buildRoundAiContext } = await import('../services/wardAi');
          const m = /\[wr:([^:]+)(?::([^\]]+))?\]/.exec(afterUser.title || '');
          if (m) wardCtx = buildRoundAiContext(m[1], m[2] || null);
          else wardHint =
            'The student hasn\'t loaded a specific round or patient into this chat yet. If the question is about ward-round practice or clinical pharmacy in general, answer directly; if it needs specific round/patient data, invite them to tap the 🏥 "Load ward round" button in the typing bar.';
        } catch { /* ignore */ }
        const sysExtra = [
          wardHint,
          wardCtx ? `LOADED ROUND DATA (reference these specifics — do NOT give a generic answer when concrete data is present):\n\n${wardCtx}` : '',
        ].filter(Boolean).join('\n\n');
        res = await runAiModule(sectionKey, prompt, sysExtra, opts);
      } else {
        res = await runAiModule(sectionKey, prompt, '', opts);
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
    const base: ChatSession = currentSession ?? newChatSession(sectionKey, active.label);
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
    const { newDisease, newMedicine, newInvestigation, newQuestion, newLesson, todayIso } = await import('../services/defaults');
    for (const name of parsedRecords.diseases) { if (!name.trim()) continue; await saveRec('disease', newDisease(name)); if (day && !day.conditions.includes(name)) day.conditions.push(name); saved.push('🦠 ' + name); }
    for (const name of parsedRecords.medicines) { if (!name.trim()) continue; await saveRec('medicine', newMedicine(name)); if (day && !day.medicines.includes(name)) day.medicines.push(name); saved.push('💊 ' + name); }
    for (const name of parsedRecords.investigations) { if (!name.trim()) continue; await saveRec('investigation', newInvestigation(name)); if (day && !day.investigations.includes(name)) day.investigations.push(name); saved.push('🧪 ' + name); }
    for (const text of parsedRecords.lessons) { if (!text.trim()) continue; await saveRec('lesson', newLesson(text, todayIso())); if (day && !day.lessons.includes(text)) day.lessons.push(text); saved.push('💡 ' + text); }
    for (const text of parsedRecords.questions) { if (!text.trim()) continue; await saveRec('question', newQuestion(text)); saved.push('❓ ' + text); }
    if (day && (parsedRecords.diseases.length || parsedRecords.medicines.length || parsedRecords.investigations.length || parsedRecords.lessons.length)) {
      day.updatedAt = Date.now(); await saveRec('day', day);
    }
    setParsedRecords(null);
    setMsgsInline(saved.length ? `✓ Saved ${saved.length} record(s):\n${saved.join('\n')}` : 'Nothing to save.');
  }

  async function pickWardRound(roundId: string, patientLabel?: string | null) {
    try {
      const { openRoundAi } = await import('../services/wardAi');
      const { sessionId } = await openRoundAi(roundId, patientLabel);
      setActiveId(sessionId);
      setMode('wardround');
      setWardPickerOpen(false);
      inputRef.current?.focus();
    } catch (e: any) {
      setStatus('⚠️ ' + (e?.message || 'Could not open Ward Round AI'));
    }
  }

  const showStreaming = streaming && streaming.sessionId === currentSession?.id;

  return (
    <div className="flex h-full flex-col">
      {confirmDialog}
      <PageHeader
        title="Ask Clinical AI"
        subtitle="Each section keeps its own saved chats, but every section remembers your other conversations across the app."
        action={<button className="btn-primary" onClick={newChat}>＋ New chat</button>}
      />

      {/* Grouped mode strip — horizontal scroll keeps it clean on mobile. */}
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
        {(['assistants', 'tools', 'special'] as ModeGroup[]).map((g) => (
          <div key={g} className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
            <span className="hidden px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:inline">
              {GROUP_LABEL[g]}
            </span>
            {MODES.filter((m) => m.group === g).map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  mode === m.key
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                }`}
                title={m.hint || aiModuleLabel(m.module)}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {!listOpen ? (
          <button
            className="flex h-fit shrink-0 flex-col items-center gap-1 self-start rounded-lg border border-slate-200 px-2.5 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
            onClick={() => setListOpen(true)} title="Show chat list">
            <span>☰</span><span className="text-[10px] text-slate-400">{sessions.length}</span>
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
              <span>{active.label} ({sessions.length})</span>
            </div>
            {hiddenCount > 0 && (
              <button className="btn-ghost !p-0 text-[11px] text-brand-600 dark:text-brand-400" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? '🙈 Hide hidden' : `👁 Show hidden (${hiddenCount})`}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
            {visibleSessions.length === 0 && (
              <p className="p-2 text-xs text-slate-400">{hiddenCount ? 'All chats hidden — tap "Show hidden".' : 'No chats yet. Start one below.'}</p>
            )}
            {visibleSessions.map((s) => (
              <div key={s.id}>
                {renameId === s.id ? (
                  <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-700">
                    <input
                      className="input !px-1.5 !py-0.5 text-xs" autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void renameSession(s.id, renameVal); if (e.key === 'Escape') setRenameId(null); }}
                      onBlur={() => void renameSession(s.id, renameVal)}
                      placeholder="New title…" />
                  </div>
                ) : (
                  <div
                    className={`group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs ${s.id === activeId ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} ${s.hidden ? 'opacity-50' : ''}`}
                    onClick={() => { setActiveId(s.id); setStreaming(null); }}
                    {...ctxHandlers(showMenu, sessionMenu(s))}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s.hidden && '🙈 '}{(s.title || 'Untitled').replace(/^\[[^\]]+\]\s*/, '')}
                      <span className={`ml-1 opacity-60 ${s.id === activeId ? 'text-white' : 'text-slate-400'}`}>{s.messages.length} msg{s.messages.length === 1 ? '' : 's'} · {fmtTime(s.updatedAt)}</span>
                    </span>
                    <button className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title={s.hidden ? 'Show chat' : 'Hide chat'}
                      onClick={(e) => { e.stopPropagation(); void setHidden(s.id, !s.hidden); }}>{s.hidden ? '👁' : '🙈'}</button>
                    <button className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title="Rename" onClick={(e) => { e.stopPropagation(); setRenameId(s.id); setRenameVal(s.title || ''); }}>✏️</button>
                    <button className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title="Share" onClick={(e) => { e.stopPropagation(); void shareSession(s.id); }}>📤</button>
                    <button className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
                      title="Delete" onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}>🗑</button>
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
              {mode === 'wardround' ? (
                <WardRoundLauncher rounds={wardRounds} entries={wardEntries} onPick={pickWardRound} />
              ) : active.auto ? (
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => void send()}>▶ Run now</button>
              ) : (
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => inputRef.current?.focus()}>✍️ Start typing</button>
              )}
              <p className="text-[11px] text-slate-400">Conversations save automatically. All sections share cross-chat memory.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {(currentSession?.messages ?? []).map((m, i) => (
                <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100'}`}>
                    {m.images && m.images.length > 0 && (
                      <div className={`mb-2 flex flex-wrap gap-1.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
                        {m.images.map((u, ui) => (<img key={ui} src={u} alt="attached" className="h-24 w-24 rounded-lg object-cover" />))}
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}
              {thisBusy && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[92%]">
                    <AiThinking moduleLabel={aiModuleLabel(sectionKey)} live={showStreaming ? streaming.text : undefined}
                      detail={showStreaming ? undefined : `Working on: ${currentSession?.title.replace(/^\[[^\]]+\]\s*/, '') || active.placeholder}`} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {parsedRecords && (
            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 text-xs font-semibold text-slate-500">Detected — review before saving:</div>
              <div className="flex flex-wrap gap-1.5">
                {parsedRecords.diseases.map((x) => <span key={x} className="rounded bg-brand-50 px-2 py-0.5 text-xs text-slate-900 dark:bg-brand-900 dark:text-slate-100">🦠 {x}</span>)}
                {parsedRecords.medicines.map((x) => <span key={x} className="rounded bg-sky-50 px-2 py-0.5 text-xs text-slate-900 dark:bg-sky-900 dark:text-slate-100">💊 {x}</span>)}
                {parsedRecords.investigations.map((x) => <span key={x} className="rounded bg-violet-50 px-2 py-0.5 text-xs text-slate-900 dark:bg-violet-900 dark:text-slate-100">🧪 {x}</span>)}
                {parsedRecords.lessons.map((x) => <span key={x} className="rounded bg-amber-50 px-2 py-0.5 text-xs text-slate-900 dark:bg-amber-900 dark:text-slate-100">💡 {x}</span>)}
                {parsedRecords.questions.map((x) => <span key={x} className="rounded bg-red-50 px-2 py-0.5 text-xs text-slate-900 dark:bg-red-900 dark:text-slate-100">❓ {x}</span>)}
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
                  <button className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white"
                    onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))} title="Remove">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Ward Round attachment chip — visible above composer during a ward-round chat. */}
          {mode === 'wardround' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 pt-2 dark:border-slate-700">
              {wardAttachment ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                    🏥 {wardAttachment.round?.ward || 'Round'}{wardAttachment.round?.date ? ` · ${wardAttachment.round.date}` : ''}
                    {wardAttachment.patientLabel ? <> · 🛏️ {wardAttachment.patientLabel}</> : null}
                  </span>
                  <button className="text-[11px] text-slate-500 underline-offset-2 hover:underline" onClick={() => setWardPickerOpen(true)}>
                    Change round / patient
                  </button>
                  <button className="text-[11px] text-slate-400 hover:text-red-500" onClick={newChat} title="Start a fresh ward-round chat (no round loaded)">
                    New (no round)
                  </button>
                </>
              ) : (
                <button
                  className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                  onClick={() => setWardPickerOpen(true)}
                  title="Load a ward round (and optionally a patient) so the AI has the full case">
                  🏥 Load ward round / patient
                </button>
              )}
            </div>
          )}

          {/* Composer */}
          <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickImages(e.target.files)} />
            <button className="btn-ghost !px-2 !py-1 text-lg" onClick={() => fileRef.current?.click()} title="Attach image(s)" disabled={thisBusy || pendingImages.length >= 4}>🖼</button>
            {mode === 'wardround' && (
              <button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => setWardPickerOpen(true)} title="Pick / change ward round or patient">🏥</button>
            )}
            <input
              ref={inputRef} className="input flex-1" placeholder={active.placeholder}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !thisBusy && void send()}
              disabled={thisBusy} />
            {active.auto ? (
              <button className="btn-primary" onClick={() => void send()} disabled={thisBusy} title="Run now">
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

      {/* Ward Round picker modal — reachable from empty state AND the typing-bar button, mid-chat. */}
      {wardPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3" onClick={() => setWardPickerOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">🏥 Pick ward round &amp; patient</div>
              <button className="btn-ghost !p-1 text-sm" onClick={() => setWardPickerOpen(false)}>✕</button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Choose a round to discuss the whole list, or tap a specific patient for a deep case walkthrough. The AI will load every capture — meds, conditions, investigations, notes, reasoning, reflections — so it can teach, quiz and flag gaps.
            </p>
            <WardRoundLauncher rounds={wardRounds} entries={wardEntries} onPick={pickWardRound} />
          </div>
        </div>
      )}
    </div>
  );
}

export { EmptyState };

/** Round → patient picker, reused by both empty-state and in-chat 🏥 button. */
function WardRoundLauncher({
  rounds, entries, onPick,
}: {
  rounds: WardRound[];
  entries: WardEntry[];
  onPick: (roundId: string, patientLabel?: string | null) => void;
}) {
  const [roundId, setRoundId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const chosen = rounds.find((r) => r.id === roundId) ?? null;
  const patients = chosen
    ? Array.from(new Set((entries || []).filter((e) => e.roundId === chosen.id && (e.patientLabel || '').trim()).map((e) => e.patientLabel!.trim()))).sort()
    : [];

  const filtered = rounds.slice()
    .sort((a, b) => (b.date + b.updatedAt).localeCompare(a.date + a.updatedAt))
    .filter((r) => !query.trim() || (r.ward + ' ' + r.date + ' ' + (r.focus || '')).toLowerCase().includes(query.toLowerCase()));

  if (!rounds.length) {
    return (
      <div className="max-w-md rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">
        No ward rounds yet. Start one from 🏥 Ward Rounds, then come back to discuss it with Ward Round AI.
      </div>
    );
  }

  if (!chosen) {
    return (
      <div className="w-full space-y-2">
        <input className="input !py-1.5 text-xs" placeholder="Search rounds by ward / date / focus…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="p-2 text-xs text-slate-400">No rounds match your search.</p>}
          {filtered.map((r) => {
            const n = (entries || []).filter((e) => e.roundId === r.id).length;
            const pats = new Set((entries || []).filter((e) => e.roundId === r.id).map((e) => (e.patientLabel || '').trim()).filter(Boolean)).size;
            return (
              <button key={r.id}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950/30"
                onClick={() => setRoundId(r.id)}>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold">
                    🏥 <span className="truncate">{r.ward}</span>
                    {r.status === 'active' && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Active</span>}
                  </span>
                  <span className="ml-5 text-xs text-slate-500">{r.date}{r.focus ? ` · ${r.focus}` : ''}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-slate-400">
                  {n} capture{n === 1 ? '' : 's'} · {pats} patient{pats === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const nAll = entries.filter((e) => e.roundId === chosen.id).length;
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between text-xs">
        <button className="text-brand-600 hover:underline" onClick={() => setRoundId(null)}>← Change round</button>
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          🏥 {chosen.ward} · {chosen.date}
          {chosen.focus ? <span className="ml-1 text-slate-400">· {chosen.focus}</span> : null}
        </span>
      </div>
      <div className="space-y-2">
        <button
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          onClick={() => onPick(chosen.id, null)}>
          ▶ Discuss the whole round ({nAll} capture{nAll === 1 ? '' : 's'}{patients.length ? ` · ${patients.length} patient${patients.length === 1 ? '' : 's'}` : ''})
        </button>
        {patients.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Or pick a patient</div>
            <div className="flex flex-wrap gap-1.5">
              {patients.map((p) => {
                const n = entries.filter((e) => e.roundId === chosen.id && (e.patientLabel || '').trim() === p).length;
                const meds = entries.filter((e) => e.roundId === chosen.id && (e.patientLabel || '').trim() === p && e.type === 'medicine').length;
                const conds = entries.filter((e) => e.roundId === chosen.id && (e.patientLabel || '').trim() === p && e.type === 'condition').length;
                return (
                  <button key={p}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950/30"
                    onClick={() => onPick(chosen.id, p)}
                    title={`${n} capture${n === 1 ? '' : 's'}${meds ? ` · ${meds} med${meds === 1 ? '' : 's'}` : ''}${conds ? ` · ${conds} condition${conds === 1 ? '' : 's'}` : ''}`}>
                    🛏️ {p} <span className="text-slate-400">({n})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          💡 The AI will walk through medications (class/mechanism/counselling/monitoring/ADRs), conditions (pathophys / typical first-line class), investigation interpretation, clinical reasoning, knowledge gaps, quiz you on the case, and end with a "Next to study" list.
        </p>
      </div>
    </div>
  );
}
