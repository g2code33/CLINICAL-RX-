import { askAi, PERSONAS, availability, type AiPersona, type AskOptions, type AskResult, type AiSource } from './aiOrchestrator';
import { retrieveKnowledge } from './intelligence';
import { weekBounds } from './wardRounds';
import { todayIso } from './defaults';

/**
 * 🧩 AI APPLICATION SERVICE
 *
 * The layer the UI actually imports. It turns product features ("quiz me on
 * this week", "search with AI", "summarise this bundle") into orchestrator
 * calls, and parses structured replies so components receive typed data
 * instead of raw text.
 *
 *   UI → aiService → aiOrchestrator → provider → cloud | local
 *
 * No component ever touches a provider or an API key.
 */

// ---- Structured output helpers ----------------------------------------

/** Pull the first JSON object/array out of a model reply, tolerating fences. */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];
  for (const c of candidates) {
    const start = c.search(/[[{]/);
    if (start < 0) continue;
    const open = c[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(c.slice(start, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/** Ask for JSON and parse it, retrying once with a stricter instruction. */
export async function askStructured<T>(
  opts: AskOptions & { schemaHint: string }
): Promise<{ ok: boolean; data: T | null; raw: string; error?: string; sources: AiSource[] }> {
  const instruction = `\n\nRespond with VALID JSON ONLY, no prose and no markdown fences, matching exactly this shape:\n${opts.schemaHint}`;
  const res = await askAi({ ...opts, query: opts.query + instruction, temperature: opts.temperature ?? 0.3 });
  if (!res.ok) return { ok: false, data: null, raw: '', error: res.error, sources: [] };

  let data = extractJson<T>(res.text);
  if (!data) {
    const retry = await askAi({
      ...opts,
      query: `${opts.query}\n\nReturn ONLY raw JSON matching:\n${opts.schemaHint}\nNo explanation, no code fences.`,
      temperature: 0.1,
      noContext: true,
      history: [{ role: 'assistant', content: res.text.slice(0, 2000) }],
    });
    if (retry.ok) data = extractJson<T>(retry.text);
  }
  return data
    ? { ok: true, data, raw: res.text, sources: res.sources }
    : { ok: false, data: null, raw: res.text, error: 'The model did not return usable structured data.', sources: res.sources };
}

// ---- Feature: Ask AI ---------------------------------------------------

export function ask(query: string, opts: Partial<AskOptions> = {}): Promise<AskResult> {
  return askAi({ persona: 'general', ...opts, query });
}

export function askClinical(query: string, opts: Partial<AskOptions> = {}): Promise<AskResult> {
  return askAi({ persona: 'clinical', ...opts, query });
}

/** "Explain this medicine" — passes the record AND its connected context. */
export function explainRecord(module: string, id: string, extra = ''): Promise<AskResult> {
  const persona: AiPersona = ['disease', 'medicine', 'investigation'].includes(module) ? 'clinical' : 'general';
  return askAi({
    persona,
    query:
      extra.trim() ||
      'Explain this record in a way that helps me learn it: what it is, why it matters clinically, how it connects to the other records shown, and the two or three things most worth remembering.',
    focus: { module, id },
  });
}

// ---- Feature: AI Search ------------------------------------------------

export interface AiSearchResult {
  /** Deterministic results — ALWAYS present, with or without AI. */
  records: AiSource[];
  total: number;
  /** AI narrative, only when AI is available. */
  answer?: string;
  aiError?: string;
  aiUsed: boolean;
}

/**
 * Search with AI.
 *
 * The deterministic keyword search runs FIRST and always succeeds. The AI only
 * adds a narrative on top. If AI is off, offline or broken, the user still gets
 * their results — AI is never required for search.
 */
export async function aiSearch(query: string, limit = 20): Promise<AiSearchResult> {
  const found = retrieveKnowledge({ query, limit, includeRelationships: true });
  const records: AiSource[] = found.records.map((r) => ({
    type: String(r.module),
    id: r.id,
    title: r.title,
    date: r.date,
    academicLabel: r.academicLabel,
  }));

  const avail = availability('search');
  if (avail.effective === 'none') {
    return { records, total: found.total, aiUsed: false, aiError: avail.reason };
  }

  const res = await askAi({
    persona: 'search',
    query: `Answer this from my records: "${query}". Summarise what my records contain, group by type, and name the specific records you used. If they do not cover something, say so.`,
    retrieval: { query, limit },
  });

  return {
    records: res.ok && res.sources.length ? res.sources : records,
    total: found.total,
    answer: res.ok ? res.text : undefined,
    aiError: res.ok ? undefined : res.error,
    aiUsed: res.ok,
  };
}

// ---- Feature: Quiz -----------------------------------------------------

export interface GeneratedQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface GeneratedQuiz {
  title: string;
  questions: GeneratedQuestion[];
  sources: AiSource[];
}

const QUIZ_SCHEMA = `{
  "title": "short quiz title",
  "questions": [
    { "question": "...", "options": ["A ...","B ...","C ...","D ..."], "answer": "the exact text of the correct option", "explanation": "why, referencing what I studied" }
  ]
}`;

/** "Quiz me on what I learned this week." */
export async function quizFromPeriod(
  scope: 'week' | 'today' | 'all' | { from: string; to: string } = 'week',
  count = 5
): Promise<{ ok: boolean; quiz?: GeneratedQuiz; error?: string }> {
  let range: { from: string; to: string } | undefined;
  if (scope === 'week') {
    const w = weekBounds(todayIso());
    range = { from: w.start, to: w.end };
  } else if (scope === 'today') {
    range = { from: todayIso(), to: todayIso() };
  } else if (typeof scope === 'object') {
    range = scope;
  }

  const probe = retrieveKnowledge(range ? { dateRange: range, limit: 60 } : { limit: 60 });
  if (!probe.total) {
    return { ok: false, error: 'There is nothing recorded for that period yet, so there is nothing to quiz you on.' };
  }

  const res = await askStructured<{ title: string; questions: GeneratedQuestion[] }>({
    persona: 'revision',
    query: `Write ${count} multiple-choice questions testing ONLY what appears in my retrieved records. Each needs four options, the correct answer as the exact text of one option, and an explanation that refers back to what I actually studied.`,
    retrieval: range ? { dateRange: range, limit: 60, query: '' } : { limit: 60, query: '' },
    schemaHint: QUIZ_SCHEMA,
  });

  if (!res.ok || !res.data?.questions?.length) {
    return { ok: false, error: res.error ?? 'Could not generate a quiz.' };
  }
  const questions = res.data.questions
    .filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      question: String(q.question),
      options: q.options.map(String),
      answer: String(q.answer ?? q.options[0]),
      explanation: String(q.explanation ?? ''),
    }));

  return {
    ok: questions.length > 0,
    quiz: { title: res.data.title || 'Quiz', questions, sources: res.sources },
    error: questions.length ? undefined : 'The model returned no usable questions.',
  };
}

// ---- Feature: Period analysis -----------------------------------------

export interface PeriodAnalysis {
  summary: string;
  key_points: string[];
  questions: string[];
  weak_areas: string[];
}

const ANALYSIS_SCHEMA = `{
  "summary": "2-4 sentence overview of the period",
  "key_points": ["..."],
  "questions": ["revision questions worth answering"],
  "weak_areas": ["topics that look thin or unfinished, based only on the records"]
}`;

/** "Analyze my week" — used by the dashboard AI Home panel and Bundler AI. */
export async function analysePeriod(
  from: string,
  to: string,
  label = 'this period'
): Promise<{ ok: boolean; analysis?: PeriodAnalysis; sources: AiSource[]; error?: string }> {
  const probe = retrieveKnowledge({ dateRange: { from, to }, limit: 80 });
  if (!probe.total) {
    return { ok: false, sources: [], error: `Nothing was recorded during ${label}, so there is nothing to analyse.` };
  }

  const res = await askStructured<PeriodAnalysis>({
    persona: 'bundler',
    query: `Analyse my learning for ${label} (${from} → ${to}). Base every statement strictly on the retrieved records.`,
    retrieval: { dateRange: { from, to }, limit: 80, query: '' },
    schemaHint: ANALYSIS_SCHEMA,
  });

  if (!res.ok || !res.data) return { ok: false, sources: res.sources, error: res.error };
  return {
    ok: true,
    sources: res.sources,
    analysis: {
      summary: String(res.data.summary ?? ''),
      key_points: (res.data.key_points ?? []).map(String),
      questions: (res.data.questions ?? []).map(String),
      weak_areas: (res.data.weak_areas ?? []).map(String),
    },
  };
}

/**
 * Bundler AI: enrich a FROZEN snapshot.
 *
 * The snapshot is the input — never live data — so re-running enrichment on an
 * old bundle analyses what was true when it was created.
 */
export async function analyseSnapshot(
  snapshotText: string,
  label: string
): Promise<{ ok: boolean; analysis?: PeriodAnalysis; error?: string }> {
  if (!snapshotText.trim()) return { ok: false, error: 'This bundle has no captured records to analyse.' };

  const res = await askStructured<PeriodAnalysis>({
    persona: 'bundler',
    query: `Analyse this frozen snapshot of my learning for ${label}. Use ONLY what appears below.\n\n${snapshotText.slice(0, 12000)}`,
    noContext: true, // the snapshot IS the context — do not mix in live data
    schemaHint: ANALYSIS_SCHEMA,
  });

  if (!res.ok || !res.data) return { ok: false, error: res.error };
  return {
    ok: true,
    analysis: {
      summary: String(res.data.summary ?? ''),
      key_points: (res.data.key_points ?? []).map(String),
      questions: (res.data.questions ?? []).map(String),
      weak_areas: (res.data.weak_areas ?? []).map(String),
    },
  };
}

// ---- Feature: weak areas / revision -----------------------------------

export function explainMyLearning(): Promise<AskResult> {
  return askAi({
    persona: 'revision',
    query:
      'Look at what I have actually recorded and explain my learning back to me: what I clearly understand, what looks incomplete, and what I should revise next. Use only my real records and stored confidence — do not invent statistics.',
    retrieval: { limit: 60 },
  });
}

export function helpWithQuestion(questionText: string): Promise<AskResult> {
  return askAi({
    persona: 'clinical',
    query: `Help me work through this question. Explain the reasoning step by step rather than only giving the answer.\n\n${questionText}`,
  });
}

export { PERSONAS, availability };
export type { AiPersona, AskResult, AiSource };
