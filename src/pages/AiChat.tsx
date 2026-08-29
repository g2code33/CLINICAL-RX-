import { useEffect, useMemo, useRef, useState } from 'react';
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

/* ======================================================================
   Slash commands — type "/" anywhere in the composer to open the menu.
   Each command can either INSERT text into the input (so the student can
   edit before sending) or RUN an action directly (e.g. new chat, switch
   mode, open ward picker). Groups are user-togglable via /settings.
   ====================================================================== */

type SlashCmdGroup = 'universal' | 'prompt' | 'teach' | 'ward' | 'study' | 'career';

interface SlashCommand {
  id: string;
  cmd: string;          // the "/xyz" token
  label: string;        // short label shown in the menu
  hint: string;         // one-line description
  group: SlashCmdGroup;
  icon: string;
  /** Modes in which this command is offered. `undefined` = everywhere. */
  modes?: Mode[];
  /** If set, running the command inserts this prompt into the composer. */
  insert?: string;
  /** If set, running the command fires this action immediately. */
  run?: (ctx: SlashRunCtx) => void | Promise<void>;
}

interface SlashRunCtx {
  setInput: (v: string) => void;
  send: (text?: string) => Promise<void>;
  setMode: (m: Mode) => void;
  newChat: () => void;
  openWardPicker: () => void;
  focusInput: () => void;
  openSlashSettings: () => void;
  attachImages: () => void;
  setStatus: (msg: string) => void;
}

const SLASH_CMD_GROUPS: { key: SlashCmdGroup; label: string; icon: string }[] = [
  { key: 'universal', label: 'General', icon: '⚡' },
  { key: 'prompt',    label: 'Quick prompts', icon: '💬' },
  { key: 'teach',     label: 'Teach me', icon: '🧠' },
  { key: 'ward',      label: 'Ward round', icon: '🏥' },
  { key: 'study',     label: 'Study / revision', icon: '📚' },
  { key: 'career',    label: 'Career', icon: '🎓' },
];

const SLASH_SETTINGS_KEY = 'clinical-rx:slash-groups';

function loadSlashGroups(): Record<SlashCmdGroup, boolean> {
  const def: Record<SlashCmdGroup, boolean> = {
    universal: true, prompt: true, teach: true, ward: true, study: true, career: true,
  };
  try {
    const raw = localStorage.getItem(SLASH_SETTINGS_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return { ...def, ...parsed };
  } catch { return def; }
}

function saveSlashGroups(g: Record<SlashCmdGroup, boolean>) {
  try { localStorage.setItem(SLASH_SETTINGS_KEY, JSON.stringify(g)); } catch { /* ignore */ }
}

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
  { key: 'general',  icon: '🤖', label: 'General',      group: 'assistants', module: 'chat',       placeholder: 'Ask anything — attach images (🖼) for AI vision: prescriptions, drug labels, slides, notes…', hint: 'Free-form assistant — accepts images on vision-capable models' },
  { key: 'clinical', icon: '🩺', label: 'Clinical',     group: 'assistants', module: 'tutor',      placeholder: 'e.g. Explain hypertension, how amlodipine works, an investigation…', hint: 'Disease / medicine / investigation explainer with WHO→WHAT→WHERE→WHY→HOW→DT' },
  { key: 'revision', icon: '📚', label: 'Revision',     group: 'assistants', module: 'revision',   placeholder: 'Generate my revision plan', auto: true, hint: 'Spaced-repetition revision coach' },
  { key: 'search',   icon: '🔎', label: 'Search',       group: 'assistants', module: 'search',     placeholder: 'Search my saved records — diseases, meds, notes, rounds…', hint: 'Answers strictly from YOUR saved records' },
  { key: 'bundler',  icon: '📦', label: 'Bundler',      group: 'assistants', module: 'bundler',    placeholder: 'Summarise a day/week of learning, find gaps and revision priorities', auto: true },
  { key: 'career',   icon: '🎓', label: 'Career',       group: 'assistants', module: 'career',     placeholder: 'CV help, interview prep, rotation reflection, goals…' },
  { key: 'research', icon: '🔬', label: 'Research',     group: 'assistants', module: 'research',   placeholder: 'Form a research question, plan a study, organise reading…' },
  { key: 'analyze',  icon: '📊', label: 'Analyze',      group: 'tools',      module: 'analyzer',   placeholder: 'Analyze my recent clinical learning', auto: true },
  { key: 'organize', icon: '📝', label: 'Organize',     group: 'tools',      module: 'notes',      placeholder: 'Turn a rough note into structured records (e.g. "Saw a patient with high BP…")' },
  { key: 'questions',icon: '❓', label: 'Questions',    group: 'tools',      module: 'questionGen',placeholder: 'Focus (optional, e.g. antihypertensives) or leave blank → Enter' },
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
  const [wardPickerOpen, setWardPickerOpen] = useState(false);
  const [slashSettingsOpen, setSlashSettingsOpen] = useState(false);
  const [slashGroups, setSlashGroups] = useState<Record<SlashCmdGroup, boolean>>(() => loadSlashGroups());
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashSel, setSlashSel] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const slashRef = useRef<HTMLDivElement>(null);

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

  const wardAttachment: { roundId: string; patientLabel: string | null; round?: WardRound } | null = (() => {
    if (mode !== 'wardround' || !currentSession) return null;
    const m = /\[wr:([^:]+)(?::([^\]]+))?\]/.exec(currentSession.title || '');
    if (!m) return null;
    return { roundId: m[1], patientLabel: m[2] || null, round: wardRounds.find((x) => x.id === m[1]) };
  })();

  /* ---------- Slash command catalogue ---------- */
  const slashCommands: SlashCommand[] = useMemo(() => [
    // Universal
    { id: 'help', cmd: '/help', label: 'Help — what can this AI do?', hint: 'Show a short help card for the current mode', group: 'universal', icon: '❓', insert: 'What can you help me with right now in this mode? Give me a short list of the kinds of questions I can ask, with examples.' },
    { id: 'settings', cmd: '/settings', label: 'Slash command settings', hint: 'Choose which slash-command groups to show', group: 'universal', icon: '⚙️', run: ({ openSlashSettings }) => openSlashSettings() },
    { id: 'new', cmd: '/new', label: 'New chat', hint: 'Start a fresh conversation in the current section', group: 'universal', icon: '➕', run: ({ newChat }) => newChat() },
    { id: 'image', cmd: '/image', label: 'Attach image(s)', hint: 'Add photos (prescriptions, slides, notes) for AI vision', group: 'universal', icon: '🖼', run: ({ attachImages }) => attachImages() },
    { id: 'clear', cmd: '/clear', label: 'Clear input', hint: 'Empty the composer', group: 'universal', icon: '🧹', run: ({ setInput }) => setInput('') },
    // Quick prompts
    { id: 'summarize', cmd: '/summarize', label: 'Summarise this chat', hint: 'Bullet-point recap of what we have discussed so far', group: 'prompt', icon: '📋', insert: 'Summarise our conversation so far in 5–8 bullet points, highlighting the key takeaways and anything I should remember.' },
    { id: 'simplify', cmd: '/simplify', label: 'Explain like I\'m a Level 100 student', hint: 'Re-explain the last topic in very simple language', group: 'prompt', icon: '🪶', insert: 'Explain the last topic we discussed like I am a first-year pharmacy student. Avoid jargon; use analogies where helpful.' },
    { id: 'deeper', cmd: '/deeper', label: 'Go deeper', hint: 'Advanced detail, biochem / pharmacology depth', group: 'prompt', icon: '🔬', insert: 'Take me one level deeper into the last topic. Add biochemical / pharmacological mechanism, key evidence, and any nuances that separate mediocre from excellent answers.' },
    { id: 'example', cmd: '/example', label: 'Give me a clinical example', hint: 'Concrete patient-style scenario (educational, not real)', group: 'prompt', icon: '🧪', insert: 'Give me a realistic, de-identified clinical scenario that illustrates the concept we are discussing. End with 2–3 questions I should be able to answer.' },
    { id: 'mistakes', cmd: '/mistakes', label: 'Common student mistakes', hint: 'What students get wrong about this topic', group: 'prompt', icon: '⚠️', insert: 'What are the most common mistakes or misconceptions pharmacy students have on this topic? For each, state the wrong idea, the correct idea, and a one-line memory hook.' },
    { id: 'counselling', cmd: '/counsel', label: 'Patient counselling points', hint: 'What would you actually tell a patient?', group: 'prompt', icon: '💬', insert: 'Give me the 5–8 patient counselling points I should deliver for the medicine we are discussing, in plain language a patient would understand.' },
    { id: 'adr', cmd: '/adr', label: 'Adverse effects & monitoring', hint: 'ADRs, interactions, monitoring parameters', group: 'prompt', icon: '🛑', insert: 'List the most important adverse effects, red-flag interactions (with common drug classes), and the monitoring parameters (labs/clinical) for what we are discussing.' },
    // Teach me
    { id: 'teach-what', cmd: '/what', label: 'Teach me: WHAT is it', hint: 'Define and describe the concept / drug / disease', group: 'teach', icon: '📘', insert: 'Teach me WHAT it is — start with a one-sentence definition, then classification, key features, and how I\'d recognise it.' },
    { id: 'teach-why', cmd: '/why', label: 'Teach me: WHY it matters', hint: 'Clinical significance / why we care', group: 'teach', icon: '🎯', insert: 'Teach me WHY this matters clinically — what happens if I miss it, get it wrong, or don\'t counsel the patient properly.' },
    { id: 'teach-how', cmd: '/how', label: 'Teach me: HOW to manage', hint: 'General management framework (educational)', group: 'teach', icon: '🧭', insert: 'Teach me HOW we generally approach this — classes of drug used, non-drug measures, and the sequence of thinking (NOT patient-specific advice).' },
    { id: 'teach-dt', cmd: '/dt', label: 'Teach me: Drug Talk', hint: 'Counselling script I can rehearse', group: 'teach', icon: '🗣', insert: 'Give me a patient-friendly counselling script (Drug Talk) I can rehearse, in plain English, under 60 seconds.' },
    { id: 'teach-quiz', cmd: '/quizme', label: 'Quiz me on it', hint: '3 MCQs with trap-busting explanations', group: 'teach', icon: '❓', insert: 'Quiz me on the current topic with 3 MCQs. Hide the answers first, then give full teaching explanations that also bust common wrong-option traps.' },
    { id: 'compare', cmd: '/compare', label: 'Compare two things', hint: 'e.g. amlodipine vs nifedipine, ACEi vs ARB', group: 'teach', icon: '⚖️', insert: 'Compare [DRUG/CLASS A] vs [DRUG/CLASS B] across: mechanism, indications, ADRs, monitoring, counselling, and when you would pick one over the other. Give the answer as a clean table (markdown) followed by a one-sentence take-home.' },
    { id: 'mnemonic', cmd: '/mnemonic', label: 'Make a mnemonic', hint: 'C memorable mnemonic for the key points', group: 'teach', icon: '🧩', insert: 'Give me a memorable mnemonic for the key points we just covered, and walk me through each letter so I actually remember it.' },
    // Ward-round specific
    { id: 'ward-load', cmd: '/load', label: 'Load ward round / patient', hint: 'Pick a round (and optionally a patient) to discuss', group: 'ward', icon: '🏥', modes: ['wardround'], run: ({ openWardPicker }) => openWardPicker() },
    { id: 'ward-walkthrough', cmd: '/walkthrough', label: 'Full patient walkthrough', hint: 'Case summary → meds → conditions → reasoning → gaps', group: 'ward', icon: '🛏️', modes: ['wardround'], insert: 'Give me the full teaching walkthrough for the loaded patient/round: case summary, medications (class/MOA/counselling/monitoring/ADRs), conditions (pathophys/typical first-line class), investigations (interpretation pearls), clinical reasoning, gaps I still have, and 3 quick quiz questions.' },
    { id: 'ward-meds', cmd: '/meds', label: 'Drug-by-drug breakdown', hint: 'Every captured medicine, one by one', group: 'ward', icon: '💊', modes: ['wardround'], insert: 'Go through EVERY captured medicine one by one: class, mechanism, indication in this context, key counselling, top 2-3 ADRs, 1 interaction to watch, and 1 monitoring parameter. Bullet points.' },
    { id: 'ward-reasoning', cmd: '/reasoning', label: 'Walk through my reasoning', hint: 'Challenge & refine my recorded clinical reasoning', group: 'ward', icon: '🧠', modes: ['wardround'], insert: 'Walk through the clinical-reasoning captures I made. For each one, point out what I got right, what I missed, what I am confused about, and how I could have thought about it more clearly.' },
    { id: 'ward-gaps', cmd: '/gaps', label: 'My knowledge gaps', hint: 'What I need to go and study, prioritised', group: 'ward', icon: '🕳', modes: ['wardround'], insert: 'From everything in this round, what are my biggest knowledge gaps? Prioritise them: 1) will-patient-safety gaps, 2) will-come-up-in-exam gaps, 3) nice-to-know. For each, tell me exactly what to study and one exam-style MCQ.' },
    { id: 'ward-quiz', cmd: '/quiz', label: 'Quiz me on this case', hint: '5-question mini-viva based on the round', group: 'ward', icon: '🎯', modes: ['wardround'], insert: 'Give me a 5-question mini-viva on this loaded round/patient. Mix MCQs and short-answer. Wait for my answers before marking; then give full teaching explanations.' },
    { id: 'ward-sbar', cmd: '/sbar', label: 'Write an SBAR handover', hint: 'Practice an SBAR from the case', group: 'ward', icon: '📞', modes: ['wardround'], insert: 'Help me draft a concise SBAR (Situation, Background, Assessment, Recommendation) handover for this patient based on what I captured. Flag any gaps where I don\'t have enough data yet.' },
    { id: 'ward-soap', cmd: '/soap', label: 'Write a SOAP note', hint: 'Turn my captures into a SOAP-style note', group: 'ward', icon: '📝', modes: ['wardround'], insert: 'Reorganise my captures for this patient into a SOAP note (Subjective, Objective, Assessment, Plan), clearly marking anything I didn\'t actually capture so I don\'t invent data.' },
    { id: 'ward-drp', cmd: '/drp', label: 'Spot drug-related problems', hint: 'Find potential DRPs in the captured medicines', group: 'ward', icon: '⚠️', modes: ['wardround'], insert: 'From the captured medicines and conditions, flag potential drug-related problems (indication, effectiveness, safety, adherence) that I should think about. Be explicit that these are educational prompts, not recommendations.' },
    { id: 'ward-counselling', cmd: '/counselpatient', label: 'Counselling per medicine', hint: 'Patient-friendly scripts for every med', group: 'ward', icon: '💬', modes: ['wardround'], insert: 'For every captured medicine, write a 30-second patient-friendly counselling script I could actually use on the ward.' },
    // Study / revision
    { id: 'mcq', cmd: '/mcq', label: 'Generate MCQs', hint: '5 MCQs on the topic or week', group: 'study', icon: '❓', modes: ['general', 'clinical', 'revision', 'questions', 'wardround'], insert: 'Generate 5 high-quality MCQs on the topic/week/round we are discussing, with 4 options each and a full 3–6 sentence teaching explanation per question that busts the wrong options.' },
    { id: 'plan', cmd: '/plan', label: 'Revision plan', hint: 'Realistic plan for the next 3-7 days', group: 'study', icon: '🗓', modes: ['general', 'clinical', 'revision', 'analyze', 'wardround'], insert: 'Give me a realistic 7-day revision plan based on my recent learning / this round: 20–40 min per day, active recall first, with exact topics and why they are prioritised.' },
    { id: 'flashcards', cmd: '/flashcards', label: 'Make flashcards', hint: 'Q/A flashcards I can copy into Anki', group: 'study', icon: '🗂', insert: 'Turn what we just covered into 8–12 Anki-style flashcards (Q: on one side, A: on the other). Make cards atomic (one fact per card), not multi-question.' },
    { id: 'recall', cmd: '/recall', label: 'Active recall test', hint: 'Blank-page active recall prompts', group: 'study', icon: '🧠', insert: 'Give me 10 active-recall prompts (short-answer questions) on this topic/round. I\'ll answer from memory before scrolling on — don\'t give the answers yet; after I reply, mark and explain.' },
    // Career
    { id: 'cv', cmd: '/cv', label: 'Draft CV bullet', hint: 'Turn an experience into a CV line', group: 'career', icon: '📄', modes: ['career', 'general'], insert: 'Help me turn this rotation / experience into a strong CV bullet using the STAR + quantified-impact style. I\'ll paste my rough note next.' },
    { id: 'interview', cmd: '/interview', label: 'Interview question', hint: 'Practice a pharmacy/clinical interview question', group: 'career', icon: '🎙', modes: ['career', 'general'], insert: 'Ask me a realistic pharmacy-student / intern interview question (clinical or behavioural), wait for my answer, then give me structured feedback: what worked, what to tighten, and a model answer.' },
    { id: 'swot', cmd: '/swot', label: 'SWOT analysis', hint: 'SWOT on my current progress / an opportunity', group: 'career', icon: '📊', modes: ['career', 'general'], insert: 'Using my saved PharmD Journey / rotations / skills, help me do a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) of my current professional position. Only use what\'s actually saved; flag what is missing.' },
  ], []);

  const activeSlashCommands = useMemo(() => {
    return slashCommands
      .filter((c) => slashGroups[c.group] && (!c.modes || c.modes.includes(mode)))
      .filter((c) => {
        if (!slashQuery) return true;
        const q = slashQuery.toLowerCase();
        return c.cmd.toLowerCase().includes(q) || c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q);
      });
  }, [slashCommands, slashGroups, mode, slashQuery]);

  // Close slash menu when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!slashRef.current) return;
      if (!slashRef.current.contains(e.target as Node)) setSlashOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Keep selection in bounds when the filtered list changes.
  useEffect(() => {
    if (slashSel >= activeSlashCommands.length) setSlashSel(Math.max(0, activeSlashCommands.length - 1));
  }, [activeSlashCommands.length, slashSel]);

  function runSlashCmd(cmd: SlashCommand) {
    setSlashOpen(false);
    setSlashQuery('');
    // Strip the /xyz token from the input (replace from last slash to cursor).
    const newInput = input.replace(/\/[^\s]*$/, '').trimEnd();
    setInput(newInput);
    const ctx: SlashRunCtx = {
      setInput,
      send,
      setMode,
      newChat,
      openWardPicker: () => setWardPickerOpen(true),
      focusInput: () => inputRef.current?.focus(),
      openSlashSettings: () => setSlashSettingsOpen(true),
      attachImages: () => fileRef.current?.click(),
      setStatus,
    };
    if (cmd.run) {
      void Promise.resolve(cmd.run(ctx));
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    if (cmd.insert) {
      const joined = newInput ? newInput + '\n\n' + cmd.insert : cmd.insert;
      setInput(joined);
      // Move caret to end and focus.
      setTimeout(() => {
        inputRef.current?.focus();
        const len = joined.length;
        try { inputRef.current?.setSelectionRange(len, len); } catch { /* ignore */ }
      }, 30);
    }
  }

  function onChangeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInput(v);
    // Detect "/"-trigger: last "word" starts with "/"
    const m = /\/([^\s/]*)$/.exec(v);
    if (m) {
      setSlashQuery(m[1]);
      setSlashOpen(true);
      setSlashSel(0);
    } else {
      setSlashOpen(false);
      setSlashQuery('');
    }
  }

  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashOpen && activeSlashCommands.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSel((i) => (i + 1) % activeSlashCommands.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashSel((i) => (i - 1 + activeSlashCommands.length) % activeSlashCommands.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        runSlashCmd(activeSlashCommands[slashSel]);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return; }
    }
    if (e.key === 'Enter' && !thisBusy && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, streaming, busyBySection, activeId, currentSession?.messages.length]);

  useEffect(() => {
    setParsedRecords(null);
    setWardPickerOpen(false);
    setSlashOpen(false);
  }, [mode]);

  useEffect(() => {
    try {
      const sid = sessionStorage.getItem('crx:wardAiSession');
      if (!sid) return;
      sessionStorage.removeItem('crx:wardAiSession');
      const exists = useData.getState().chats.find((c) => c.id === sid);
      if (exists) { setMode('wardround'); setActiveId(sid); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = search.get('q');
    if (!q) return;
    setSearch({}, { replace: true });
    setInput(q);
    const t = setTimeout(() => { void send(q); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      `**Section:** ${active.label} · **Saved:** ${fmtTime(s.updatedAt)} · **Messages:** ${s.messages.length}`, '',
    ];
    for (const m of s.messages) { lines.push(`**${m.role === 'user' ? 'Student' : 'AI'}:** ${m.text}`); lines.push(''); }
    await copyToClipboard(lines.join('\n'));
    setStatus(`✓ Chat copied — paste it anywhere to share`);
  }

  function extractStructured(text: string) {
    const empty = { medicines: [] as string[], diseases: [] as string[], investigations: [] as string[], lessons: [] as string[], questions: [] as string[] };
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
    setSlashOpen(false);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const { queueAiTask } = await import('../services/aiTaskQueue');
      queueAiTask({ section: sectionKey, mode, userText, sessionTitle: afterUser.title });
      await save('chat', { ...afterUser, messages: [...afterUser.messages, { id: uid(), role: 'ai' as const, text: '📡 You are offline — queued, will run when you reconnect.', ts: Date.now() }], updatedAt: Date.now() });
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
            'The student hasn\'t loaded a specific round/patient yet. Answer general ward-round / clinical-pharmacy questions directly; if a question needs case-specific data, invite them to use /load or tap the 🏥 button.';
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
    if (day && (parsedRecords.diseases.length || parsedRecords.medicines.length || parsedRecords.investigations.length || parsedRecords.lessons.length)) { day.updatedAt = Date.now(); await saveRec('day', day); }
    setParsedRecords(null);
    setMsgsInline(saved.length ? `✓ Saved ${saved.length} record(s):\n${saved.join('\n')}` : 'Nothing to save.');
  }

  async function pickWardRound(roundId: string, patientLabel?: string | null) {
    try {
      const { openRoundAi } = await import('../services/wardAi');
      const { sessionId } = await openRoundAi(roundId, patientLabel ?? null);
      setActiveId(sessionId); setMode('wardround'); setWardPickerOpen(false);
      inputRef.current?.focus();
    } catch (e: any) { setStatus('⚠️ ' + (e?.message || 'Could not open Ward Round AI')); }
  }

  const showStreaming = streaming && streaming.sessionId === currentSession?.id;

  return (
    <div className="flex h-full flex-col">
      {confirmDialog}
      <PageHeader
        title="Ask Clinical AI"
        subtitle="Type / in the composer for quick actions · each section keeps its own chats, but memory is shared."
        action={<button className="btn-primary" onClick={newChat}>＋ New chat</button>}
      />

      {/* Collapsible grouped mode picker */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['assistants', 'tools', 'special'] as ModeGroup[]).map((g) => {
          const groupModes = MODES.filter((m) => m.group === g);
          const activeInGroup = groupModes.find((m) => m.key === mode);
          return <ModeGroupChip key={g} group={g} modes={groupModes} activeMode={mode} onPick={(k) => setMode(k)} label={GROUP_LABEL[g]} activeInGroup={activeInGroup} />;
        })}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {!listOpen ? (
          <button className="flex h-fit shrink-0 flex-col items-center gap-1 self-start rounded-lg border border-slate-200 px-2.5 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
            onClick={() => setListOpen(true)} title="Show chat list">
            <span>☰</span><span className="text-[10px] text-slate-400">{sessions.length}</span>
          </button>
        ) : (
        <>
        {listOpen && (<div className="absolute inset-0 z-20 bg-slate-900/30 md:hidden" onClick={() => setListOpen(false)} />)}
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
            {visibleSessions.length === 0 && (<p className="p-2 text-xs text-slate-400">{hiddenCount ? 'All chats hidden.' : 'No chats yet — type / below to start.'}</p>)}
            {visibleSessions.map((s) => (
              <div key={s.id}>
                {renameId === s.id ? (
                  <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-700">
                    <input className="input !px-1.5 !py-0.5 text-xs" autoFocus value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void renameSession(s.id, renameVal); if (e.key === 'Escape') setRenameId(null); }}
                      onBlur={() => void renameSession(s.id, renameVal)} placeholder="New title…" />
                  </div>
                ) : (
                  <div className={`group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs ${s.id === activeId ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} ${s.hidden ? 'opacity-50' : ''}`}
                    onClick={() => { setActiveId(s.id); setStreaming(null); }} {...ctxHandlers(showMenu, sessionMenu(s))}>
                    <span className="min-w-0 flex-1 truncate">
                      {s.hidden && '🙈 '}{(s.title || 'Untitled').replace(/^\[[^\]]+\]\s*/, '')}
                      <span className={`ml-1 opacity-60 ${s.id === activeId ? 'text-white' : 'text-slate-400'}`}>{s.messages.length} msg{s.messages.length === 1 ? '' : 's'} · {fmtTime(s.updatedAt)}</span>
                    </span>
                    <button className={`shrink-0 opacity-0 group-hover:opacity-100 ${s.id === activeId ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-brand-600'}`}
                      title={s.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); void setHidden(s.id, !s.hidden); }}>{s.hidden ? '👁' : '🙈'}</button>
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
        <div className="card relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!currentSession && !streaming ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-4xl">{active.icon}</div>
              <div className="text-sm font-semibold">{active.label} · {aiModuleLabel(active.module)}</div>
              <p className="max-w-md text-xs text-slate-400">{active.placeholder}</p>
              <p className="max-w-md text-[11px] text-slate-400">Tip: type <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">/</code> in the box below for quick prompts, teaching actions, and ward-round shortcuts.</p>
              {mode === 'wardround' ? (
                <WardRoundLauncher rounds={wardRounds} entries={wardEntries} onPick={pickWardRound} />
              ) : active.auto ? (
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => void send()}>▶ Run now</button>
              ) : (
                <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => inputRef.current?.focus()}>✍️ Start typing</button>
              )}
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
                  <div className="w-full max-w-[92%]"><AiThinking moduleLabel={aiModuleLabel(sectionKey)} live={showStreaming ? streaming.text : undefined} detail={showStreaming ? undefined : `Working on: ${currentSession?.title.replace(/^\[[^\]]+\]\s*/, '') || active.placeholder}`} /></div>
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

          {mode === 'wardround' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 pt-2 dark:border-slate-700">
              {wardAttachment ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800 dark:bg-brand-600 dark:text-white">
                    🏥 {wardAttachment.round?.ward || 'Round'}{wardAttachment.round?.date ? ` · ${wardAttachment.round.date}` : ''}
                    {wardAttachment.patientLabel ? <> · 🛏️ {wardAttachment.patientLabel}</> : null}
                  </span>
                  <button className="text-[11px] text-slate-500 underline-offset-2 hover:underline" onClick={() => setWardPickerOpen(true)}>Change</button>
                  <button className="text-[11px] text-slate-400 hover:text-red-500" onClick={newChat} title="Start fresh">New (no round)</button>
                </>
              ) : (
                <button className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                  onClick={() => setWardPickerOpen(true)} title="Load a ward round / patient">🏥 Load ward round / patient</button>
              )}
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-slate-200 p-3 dark:border-slate-700">
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickImages(e.target.files)} />
              <button className="btn-ghost !px-2 !py-1 text-lg" onClick={() => fileRef.current?.click()} title="Attach image(s)" disabled={thisBusy || pendingImages.length >= 4}>🖼</button>
              {mode === 'wardround' && (<button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => setWardPickerOpen(true)} title="Pick / change ward round or patient">🏥</button>)}
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  className="input w-full pr-16"
                  placeholder={active.placeholder}
                  value={input}
                  onChange={onChangeInput}
                  onKeyDown={onKeyDownInput}
                  disabled={thisBusy} />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-300 dark:text-slate-600">/ for menu</span>
                {/* Slash menu */}
                {slashOpen && activeSlashCommands.length > 0 && (
                  <div ref={slashRef} className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                    {(() => {
                      // group by category for readability
                      const grouped: Record<string, SlashCommand[]> = {};
                      for (const c of activeSlashCommands) { (grouped[c.group] ||= []).push(c); }
                      let idx = -1;
                      return (
                        <>
                          {SLASH_CMD_GROUPS.filter((g) => grouped[g.key]).map((g) => (
                            <div key={g.key} className="mb-1">
                              <div className="px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.icon} {g.label}</div>
                              {grouped[g.key].map((c) => {
                                idx++;
                                const selected = idx === slashSel;
                                return (
                                  <button key={c.id}
                                    onMouseEnter={() => setSlashSel(idx)}
                                    onClick={() => runSlashCmd(c)}
                                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs ${selected ? 'bg-brand-600 text-white dark:bg-brand-600 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                    <span className="text-base leading-none">{c.icon}</span>
                                    <span className="min-w-0 flex-1">
                                      <span className="font-semibold"><code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-700">{c.cmd}</code> {c.label}</span>
                                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{c.hint}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              {active.auto ? (
                <button className="btn-primary" onClick={() => void send()} disabled={thisBusy} title="Run now">{thisBusy ? '…' : '▶ Run'}</button>
              ) : (
                <button className="btn-primary" onClick={() => void send()} disabled={thisBusy} title="Send">{thisBusy ? '…' : '➤'}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ward Round picker */}
      {wardPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3" onClick={() => setWardPickerOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">🏥 Pick ward round &amp; patient</div>
              <button className="btn-ghost !p-1 text-sm" onClick={() => setWardPickerOpen(false)}>✕</button>
            </div>
            <p className="mb-2 text-xs text-slate-500">Choose a round to discuss the whole list, or tap a patient for a deep case walkthrough.</p>
            <WardRoundLauncher rounds={wardRounds} entries={wardEntries} onPick={pickWardRound} />
          </div>
        </div>
      )}

      {/* Slash settings */}
      {slashSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3" onClick={() => setSlashSettingsOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">⚙️ Slash commands</div>
              <button className="btn-ghost !p-1 text-sm" onClick={() => setSlashSettingsOpen(false)}>✕</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Choose which groups of <code>/</code> commands appear while typing. Turn off what you don't use.</p>
            <div className="space-y-2">
              {SLASH_CMD_GROUPS.map((g) => (
                <label key={g.key} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                  <span className="flex items-center gap-2"><span className="text-lg">{g.icon}</span><span className="font-semibold">{g.label}</span></span>
                  <input type="checkbox" className="h-4 w-4 accent-brand-600"
                    checked={slashGroups[g.key]}
                    onChange={(e) => { const next = { ...slashGroups, [g.key]: e.target.checked }; setSlashGroups(next); saveSlashGroups(next); }} />
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-between">
              <button className="btn-ghost text-xs" onClick={() => { const all: Record<SlashCmdGroup, boolean> = { universal: true, prompt: true, teach: true, ward: true, study: true, career: true }; setSlashGroups(all); saveSlashGroups(all); }}>
                Reset to default
              </button>
              <button className="btn-primary !py-1.5 text-xs" onClick={() => setSlashSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { EmptyState };

/* ---- Small helper component for a collapsible mode-group chip ---- */
function ModeGroupChip({
  group, modes, activeMode, onPick, label, activeInGroup,
}: {
  group: ModeGroup;
  modes: ModeDef[];
  activeMode: Mode;
  onPick: (m: Mode) => void;
  label: string;
  activeInGroup?: ModeDef;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-ai-group="' + group + '"]')) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, group]);
  return (
    <div className="relative" data-ai-group={group}>
      <button onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
          activeInGroup ? 'border-brand-500 bg-brand-600 text-white shadow-sm dark:border-brand-500 dark:bg-brand-600 dark:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-600'
        }`} aria-expanded={open}>
        {activeInGroup ? <>{activeInGroup.icon} {activeInGroup.label}</> : <>▸ {label}</>}
        <span className={`text-[9px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 flex max-w-[calc(100vw-2rem)] flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800" style={{ minWidth: 200 }}>
          <div className="w-full pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
          {modes.map((m) => (
            <button key={m.key}
              onClick={() => { onPick(m.key); setOpen(false); }}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                activeMode === m.key ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-600 dark:text-white' : 'bg-slate-100 text-slate-800 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-brand-600 dark:hover:text-white'
              }`}
              title={m.hint || aiModuleLabel(m.module)}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Round → patient picker (reused empty state + in-chat 🏥 button) ---- */
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
  const filtered = rounds.slice().sort((a, b) => (b.date + b.updatedAt).localeCompare(a.date + a.updatedAt))
    .filter((r) => !query.trim() || (r.ward + ' ' + r.date + ' ' + (r.focus || '')).toLowerCase().includes(query.toLowerCase()));

  if (!rounds.length) {
    return <div className="max-w-md rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">No ward rounds yet — start one from 🏥 Ward Rounds first.</div>;
  }
  if (!chosen) {
    return (
      <div className="w-full space-y-2">
        <input className="input !py-1.5 text-xs" placeholder="Search rounds by ward / date / focus…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="p-2 text-xs text-slate-400">No rounds match.</p>}
          {filtered.map((r) => {
            const n = entries.filter((e) => e.roundId === r.id).length;
            const pats = new Set(entries.filter((e) => e.roundId === r.id).map((e) => (e.patientLabel || '').trim()).filter(Boolean)).size;
            return (
              <button key={r.id}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950/30"
                onClick={() => setRoundId(r.id)}>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold">🏥 <span className="truncate">{r.ward}</span>{r.status === 'active' && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Active</span>}</span>
                  <span className="ml-5 text-xs text-slate-500">{r.date}{r.focus ? ` · ${r.focus}` : ''}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-slate-400">{n} · {pats} pt{pats === 1 ? '' : 's'}</span>
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
        <span className="font-semibold text-slate-600 dark:text-slate-300">🏥 {chosen.ward} · {chosen.date}{chosen.focus ? <span className="ml-1 text-slate-400">· {chosen.focus}</span> : null}</span>
      </div>
      <div className="space-y-2">
        <button className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={() => onPick(chosen.id, null)}>▶ Discuss the whole round ({nAll} capture{nAll === 1 ? '' : 's'}{patients.length ? ` · ${patients.length} patient${patients.length === 1 ? '' : 's'}` : ''})</button>
        {patients.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Or pick a patient</div>
            <div className="flex flex-wrap gap-1.5">
              {patients.map((p) => {
                const n = entries.filter((e) => e.roundId === chosen.id && (e.patientLabel || '').trim() === p).length;
                return (<button key={p} className="rounded-full border border-slate-200 px-3 py-1 text-xs transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950/30" onClick={() => onPick(chosen.id, p)}>🛏️ {p} <span className="text-slate-400">({n})</span></button>);
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
