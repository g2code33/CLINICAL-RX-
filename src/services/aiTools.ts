import { useData } from '../stores/data';
import { aiChat, type AiChatOpts, type AiResult } from './ai';
import type { AiModuleConfig } from '../types';

export type AiModuleKey =
  | 'tutor'
  | 'analyzer'
  | 'notes'
  | 'questionGen'
  | 'revision'
  | 'chat'
  | 'bundler';

export type RunOpts = AiChatOpts & { excludeSessionId?: string };

const MODULE_LABEL: Record<AiModuleKey, string> = {
  tutor: 'AI Clinical Tutor',
  analyzer: 'AI Learning Analyzer',
  notes: 'AI Note Organizer',
  questionGen: 'AI Question Generator',
  revision: 'AI Revision Coach',
  chat: 'AI Clinical Chat',
  bundler: 'AI Daily/Weekly Bundler',
};

const SECTION_LABEL: Record<string, string> = {
  chat: 'Chat',
  tutor: 'Explain',
  analyzer: 'Analyze',
  notes: 'Organize',
  questionGen: 'Questions',
  revision: 'Revision',
  bundler: 'Bundler',
};

export function aiModuleLabel(key: AiModuleKey): string {
  return MODULE_LABEL[key];
}

/**
 * Record an AI task into its section's chat history (so every AI action is
 * viewable in the AI tab's "new chat" for that section). Creates a session if
 * none exists for the section; appends user+AI messages. Works from anywhere
 * (Bundles, Explain, Quiz, etc.).
 */
export async function logAiTask(section: AiModuleKey, userText: string, aiText: string, title?: string): Promise<void> {
  const st = useData.getState();
  const uid = (await import('../stores/data')).uid;
  const now = Date.now();
  const sessions = st.chats ?? [];
  let session = sessions.find((c) => c.section === section && c.messages.length > 0 && !c.hidden) || sessions.find((c) => c.section === section) || null;
  if (!session) {
    session = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      section,
      title: title || userText.replace(/\s+/g, ' ').slice(0, 48) || SECTION_LABEL[section] || section,
      messages: [],
    };
  }
  const userMsg = { id: uid(), role: 'user' as const, text: userText, ts: now };
  const aiMsg = { id: uid(), role: 'ai' as const, text: aiText, ts: Date.now() };
  await st.save('chat', {
    ...session,
    messages: [...(session.messages ?? []), userMsg, aiMsg],
    updatedAt: Date.now(),
  });
}

function studentContext(): string {
  const s = useData.getState();
  const p = s.profile;
  const prefs = s.settings?.learningProfile?.preferredExplanation ?? [];
  return [
    `Student: ${p?.programme ?? 'Pharmacy'} Level ${p?.level ?? '200'} at ${p?.site ?? 'clinical site'}.`,
    `Preferred explanation: ${prefs.length ? prefs.join(', ') : 'simple first, step-by-step'}.`,
    `My data: ${s.days.length} clinical days, ${s.diseases.length} conditions, ${s.medicines.length} medicines, ${s.investigations.length} investigations, ${s.questions.length} questions (${s.questions.filter((q) => q.status === 'open').length} open).`,
    'You are a learning aid, not a replacement for the student\'s clinical supervisor or pharmacist.',
  ].join('\n');
}

/**
 * Cross-section memory: recent messages from ALL the student's other chat
 * sessions (any section), so any AI section can recall earlier conversations
 * from any other section. Bounded so prompts stay small and fast.
 */
export function buildMemoryContext(section: AiModuleKey, excludeSessionId?: string, limit = 24): string {
  const chats = useData.getState().chats ?? [];
  const items: Array<{ ts: number; section: string; title: string; role: string; text: string }> = [];
  for (const c of chats) {
    if (c.id === excludeSessionId) continue;
    for (const m of c.messages ?? []) {
      items.push({ ts: m.ts ?? Date.now(), section: c.section, title: c.title, role: m.role, text: m.text });
    }
  }
  items.sort((a, b) => a.ts - b.ts);
  const recent = items.slice(-limit);
  if (!recent.length) return '';
  const body = recent
    .map((l) => `[${SECTION_LABEL[l.section] ?? l.section}] ${l.role === 'user' ? 'Student' : 'AI'}: ${l.text.slice(0, 400)}`)
    .join('\n');
  return `MEMORY — these are your OTHER conversations in the app (across all AI sections). Use them to remember the student's context, but never invent facts that are not present:\n${body}`;
}

export function getAiConfig(key: AiModuleKey): AiModuleConfig | null {
  const cfg = useData.getState().settings?.ai?.[key];
  if (!cfg) return null;
  return cfg;
}

/**
 * Effective config: if a module has no API key of its own, borrow one from any
 * OTHER enabled module that uses the same provider (so one key makes every
 * section work). The module's own model is kept when set.
 */
export function getEffectiveAiConfig(key: AiModuleKey): AiModuleConfig | null {
  const cfg = getAiConfig(key);
  if (!cfg) return null;

  // 1) The section's OWN key always wins.
  if (cfg.enabled && cfg.apiKey && cfg.apiKey.trim()) return cfg;

  const all = useData.getState().settings?.ai ?? {};

  // 2) Borrow a key from another enabled module on the SAME provider
  //    (keeps the section's own provider + model choice).
  for (const [k, c] of Object.entries(all)) {
    if (k === key || !c) continue;
    if (c.enabled && c.provider === cfg.provider && c.apiKey && c.apiKey.trim()) {
      return { ...cfg, apiKey: c.apiKey.trim(), model: cfg.model || c.model || '' };
    }
  }

  // 3) Fall back to ANY enabled module that has a key — use its whole
  //    config (provider + key + model), so the section still works.
  for (const [k, c] of Object.entries(all)) {
    if (k === key || !c) continue;
    if (c.enabled && c.apiKey && c.apiKey.trim()) {
      return { ...c };
    }
  }

  return cfg;
}

export function aiReady(key: AiModuleKey): boolean {
  const cfg = getEffectiveAiConfig(key);
  return !!cfg && cfg.enabled && !!cfg.apiKey;
}

/** Run any configured AI module with standard context + cross-section memory. */
export async function runAiModule(
  key: AiModuleKey,
  userPrompt: string,
  extraContext = '',
  opts: RunOpts = {}
): Promise<AiResult> {
  const cfg = getEffectiveAiConfig(key);
  if (!cfg) return { ok: false, error: `Enable "${MODULE_LABEL[key]}" in Settings → AI to use this.` };
  if (!cfg.enabled) return { ok: false, error: `"${MODULE_LABEL[key]}" is disabled in Settings.` };
  if (!cfg.apiKey) return { ok: false, error: `No API key set for "${MODULE_LABEL[key]}". Add one in Settings → AI (or set one for any module on the same provider and it will be shared).` };
  // Cross-section memory: other sessions (across all AI sections). The current
  // session's own thread is provided via opts.history, so exclude it here to
  // avoid duplication.
  const memory = buildMemoryContext(key, opts.excludeSessionId, 24);
  const system = `You are CLINICAL Rx, a clinical learning assistant.\n${studentContext()}\n${memory ? memory + '\n' : ''}${extraContext}`.trim();
  return aiChat(cfg, system, userPrompt, opts);
}

// ---- Semantic helpers used by the UI ----

/** Tutor: explain a disease/medicine/investigation from its record. */
export function explainEntity(kind: 'disease' | 'medicine' | 'investigation', rec: Record<string, any>, opts: RunOpts = {}): Promise<AiResult> {
  const label = (kind[0].toUpperCase() + kind.slice(1));
  const detail = [
    `Explain this ${label} to me at my level.`,
    'Use the WHO → WHAT → WHERE → WHY → HOW → DT structure where relevant.',
    `Record: ${JSON.stringify(rec)}`,
  ].join('\n');
  return runAiModule('tutor', detail, '', opts);
}

/** Analyzer: summarize strengths/gaps from recent clinical data. */
export function analyzeLearning(opts: RunOpts = {}): Promise<AiResult> {
  const s = useData.getState();
  const recentDays = s.days.slice(-7);
  const openQuestions = s.questions.filter((q) => q.status === 'open').slice(0, 15);
  const data = {
    recentDays: recentDays.map((d) => ({
      date: d.date,
      conditions: d.conditions,
      medicines: d.medicines,
      investigations: d.investigations,
      lessons: d.lessons,
      uncertainties: d.uncertainties,
      topicsToResearch: d.topicsToResearch,
    })),
    openQuestions: openQuestions.map((q) => q.text),
    topDiseases: s.diseases.slice(0, 10).map((d) => ({ name: d.name, encounters: d.encounters })),
    topMedicines: s.medicines.slice(0, 10).map((m) => ({ name: m.name, encounters: m.encounters })),
  };
  return runAiModule(
    'analyzer',
    'Analyze my recent clinical learning. Return: STRENGTHS (list), KNOWLEDGE GAPS (list), NEXT-STEP FOCUS (list).',
    'DATA:\n' + JSON.stringify(data),
    opts
  );
}

/** Notes: turn rough natural language into structured clinical learning records. */
export function organizeNote(text: string, opts: RunOpts = {}): Promise<AiResult> {
  return runAiModule(
    'notes',
    `Turn this clinical note into structured learning records. Return ONLY valid JSON with no commentary, shaped exactly like:
{"medicines":["..."],"diseases":["..."],"investigations":["..."],"lessons":["..."],"questions":["..."]}
Use empty arrays for anything not mentioned. Do not invent patient-identifying information.
NOTE: "${text}"`,
    'You extract structured de-identified clinical learning data from natural language.',
    opts
  );
}

/** Question generator: turn encounters into MCQs / study questions. */
export function generateQuestions(focus?: string, count = 5, opts: RunOpts = {}): Promise<AiResult> {
  const s = useData.getState();
  const context = focus
    ? focus
    : [
        ...s.days.flatMap((d) => d.conditions),
        ...s.days.flatMap((d) => d.medicines),
        ...s.diseases.map((d) => d.name),
        ...s.medicines.map((m) => m.name),
      ]
        .filter(Boolean)
        .slice(0, 12)
        .join(', ');
  return runAiModule(
    'questionGen',
    `Generate ${count} study questions from my recent clinical exposure. For each give the question, 4 options, and the correct answer with a 1-line explanation. Focus areas: ${context}.`,
    'Questions should test clinical knowledge appropriate for a pharmacy student at my level.',
    opts
  );
}

/** Revision coach: recommend what to revise next. */
export function revisionCoach(opts: RunOpts = {}): Promise<AiResult> {
  const s = useData.getState();
  const incomplete = s.diseases
    .filter((d) => {
      const r = d.revision as any;
      return r && Object.values(r).some((v) => v === false);
    })
    .map((d) => d.name);
  const gaps = s.questions.filter((q) => q.status === 'open').slice(0, 10).map((q) => q.text);
  return runAiModule(
    'revision',
    `Recommend a revision plan. I've seen these conditions recently, some with incomplete revision coverage: ${incomplete.join(', ') || 'none yet'}. My open questions: ${gaps.join('; ') || 'none'}. Give a prioritized, realistic revision list with reasons.`,
    '',
    opts
  );
}

// ---- Quiz generator ----
export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number; // index of correct option
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

/** Extract a Quiz from AI text that contains a JSON block. */
function parseQuiz(text: string): Quiz | null {
  try {
    // Strip markdown code fences if the model wrapped the JSON in ```json ```.
    let clean = text.trim();
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(clean.slice(start, end + 1));
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (!questions.length) return null;
    const normalized: QuizQuestion[] = questions
      .filter((q: any) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2)
      .map((q: any) => ({
        question: q.question,
        options: q.options.map((o: any) => String(o)),
        answer: typeof q.answer === 'number' ? q.answer : Number(q.answer) || 0,
        explanation: typeof q.explanation === 'string' ? q.explanation : '',
      }));
    if (!normalized.length) return null;
    return { title: typeof parsed.title === 'string' ? parsed.title : 'CLINICAL Rx Quiz', questions: normalized };
  } catch {
    return null;
  }
}

/** Build a quiz from recent clinical exposure + optionally a focus topic. */
export async function generateQuiz(focus?: string, count = 10, opts: RunOpts = {}): Promise<Quiz | null> {
  const s = useData.getState();
  const context = focus?.trim()
    ? focus.trim()
    : [
        ...s.days.flatMap((d) => d.conditions),
        ...s.days.flatMap((d) => d.medicines),
        ...s.diseases.map((d) => d.name),
        ...s.medicines.map((m) => m.name),
        ...s.questions.map((q) => q.text),
      ]
        .filter(Boolean)
        .slice(0, 15)
        .join(', ');

  const prompt = [
    `Create a ${count}-question multiple-choice quiz based on my clinical exposure.`,
    `Focus areas: ${context || 'general clinical pharmacy'}.`,
    `Return ONLY valid JSON in EXACTLY this shape (no commentary, no markdown):`,
    `{"title":"A short quiz title","questions":[{"question":"...","options":["A text","B text","C text","D text"],"answer":0,"explanation":"...full teaching explanation..."}]}`,
    `answer is the 0-based index of the correct option. Make options plausible and at my learning level.`,
    `EXPLANATIONS MUST BE THOROUGH AND CONVINCING — this is the most important part. For EVERY question, write a full teaching-style explanation of 3-6 sentences that:`,
    `1) clearly explains WHY the correct answer is right (the mechanism, guideline, or reasoning),`,
    `2) teaches the key clinical concept so the student actually learns it,`,
    `3) briefly explains why the wrong options are incorrect where relevant (trap-busting).`,
    `Write like an excellent tutor: precise, warm, and educational. Never write "1-line explanation" or a placeholder.`,
  ].join('\n');

  // Generous token budget + streaming + a longer timeout so big quizzes are
  // produced fully and appear progressively instead of hanging. Token budget
  // scales with the requested count (~350 tokens per question incl. the full
  // explanation) so 50-question quizzes don't get truncated.
  const res = await runAiModule('questionGen', prompt, 'Return strictly valid JSON only.', {
    ...opts,
    maxTokens: opts.maxTokens ?? Math.min(12000, 4000 + count * 350),
    timeoutMs: opts.timeoutMs ?? 180000,
    temperature: opts.temperature ?? 0.2, // lower temp = faster, more deterministic JSON
  });
  if (!res.ok) return null;
  return parseQuiz(res.text);
}
