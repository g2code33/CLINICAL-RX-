import { useData, uid } from '../stores/data';
import { getProvider, type AiGenerateRequest, type AiRuntime, type AiRuntimePreference } from './aiProvider';
import { detectLocalAi, installLocalProvider, localReady } from './localAi';
import { formatForAi, retrieveKnowledge, contextForRecord, type RetrieveOptions } from './intelligence';
import { getStage } from './academic';
import { weekBounds } from './wardRounds';
import { todayIso } from './defaults';
import { getKeyForRequest, getKeyStatus } from './aiSecrets';
import type { AiLogEntry, AiModuleConfig } from '../types';

/**
 * 🧠 AI ORCHESTRATOR
 *
 *   UI → AI Application Service → AI Orchestrator → Provider Adapter
 *                                        ↓
 *                              Intelligence Layer → SQLite
 *
 * The single funnel for every AI request in CLINICAL Rx. It:
 *   1. works out what the user is asking for (intent)
 *   2. retrieves ONLY the relevant records from the Intelligence Layer
 *   3. picks a provider (local / cloud) per the module's mode
 *   4. executes, handles failure, logs, and returns a structured result
 *
 * Crucially it never puts the whole database in a prompt — retrieval is
 * targeted and ranked, so performance holds after years of data.
 *
 * React components must never call a provider directly; they call askAi().
 */

// ---- AI personas -------------------------------------------------------

export type AiPersona = 'general' | 'clinical' | 'revision' | 'search' | 'bundler' | 'career' | 'research';

export interface PersonaDef {
  key: AiPersona;
  label: string;
  icon: string;
  /** Config key in settings.ai — keeps backwards compatibility with v1 keys. */
  configKey: string;
  system: string;
  /** Intelligence Layer sources this persona prefers (it can still see all). */
  preferredSources?: string[];
}

const SAFETY = [
  'You are an educational learning aid for a pharmacy student — never a licensed clinician and never a substitute for their supervisor.',
  'The records you are given are the student\'s own de-identified learning notes, not patient records. Never ask for or infer patient identity.',
  'Do not give patient-specific medical advice. Speak in general educational terms.',
  'State uncertainty plainly. Never fabricate sources, records or activity.',
  'Only cite records that appear in the provided context. If the context does not contain something, say so.',
  'For high-stakes clinical information, tell the student to verify against approved guidelines, the formulary, or their supervisor.',
].join(' ');

export const PERSONAS: Record<AiPersona, PersonaDef> = {
  general: {
    key: 'general',
    label: 'General Assistant',
    icon: '🤖',
    configKey: 'chat',
    system:
      'You are the CLINICAL Rx general assistant. You understand the whole application: the academic journey, courses, clinical learning, ward rounds, bundles, revision and questions. Help the student explain, summarise, organise, search and navigate their own records.',
  },
  clinical: {
    key: 'clinical',
    label: 'Clinical Assistant',
    icon: '🩺',
    configKey: 'tutor',
    system:
      'You are the CLINICAL Rx clinical learning assistant. Explain diseases, medicines and investigations, connect pharmacology to conditions, and walk through clinical reasoning. Use the WHO → WHAT → WHERE → WHY → HOW → DT structure where it helps.',
    preferredSources: ['disease', 'medicine', 'investigation', 'wardRound', 'wardEntry', 'lesson'],
  },
  revision: {
    key: 'revision',
    label: 'Revision Coach',
    icon: '📚',
    configKey: 'revision',
    system:
      'You are the CLINICAL Rx revision coach. Use active recall and spaced repetition principles. Identify genuinely weak areas from the student\'s stored revision confidence and unanswered questions — never invent performance statistics.',
    preferredSources: ['revision', 'question', 'lesson', 'disease', 'medicine', 'quiz'],
  },
  search: {
    key: 'search',
    label: 'AI Search',
    icon: '🔎',
    configKey: 'analyzer',
    system:
      'You are the CLINICAL Rx search assistant. Answer strictly from the retrieved records. Group findings by type, be concise, and always make clear which stored records an answer came from. If nothing matches, say so plainly.',
  },
  bundler: {
    key: 'bundler',
    label: 'Bundler AI',
    icon: '📦',
    configKey: 'bundler',
    system:
      'You are the CLINICAL Rx bundle analyst. Summarise a period of learning, surface recurring themes, knowledge gaps and revision priorities. Base every statement on the records provided; never invent activity that is not there.',
  },
  career: {
    key: 'career',
    label: 'Career Assistant',
    icon: '🎓',
    configKey: 'chat',
    system:
      'You are the CLINICAL Rx career assistant for a pharmacy student. You can see their PharmD Journey: academic stages, clinical experience (rotations), skills with self-rated confidence and attached evidence, projects, research, leadership roles, achievements, certifications and goals. ' +
      'Help them analyse their professional development, spot genuine gaps, structure a CV, prepare for interviews and understand professional pathways. ' +
      'CRITICAL: never invent an achievement, qualification, rotation, publication or skill. Work only from the records provided. If something is missing, say it is missing and suggest how they could evidence it. ' +
      'Skill confidence ratings belong to the student — never re-rate them or claim a competency on their behalf. ' +
      'Clearly separate STORED FACTS (what their records show) from YOUR SUGGESTIONS (what they might consider). ' +
      'Any CV wording, professional summary, cover letter or interview answer you write is a DRAFT the student must review and verify before use — say so.',
    preferredSources: [
      'skill',
      'project',
      'clinicalExperience',
      'research',
      'leadership',
      'achievement',
      'certification',
      'goal',
      'academicStage',
      'course',
    ],
  },
  research: {
    key: 'research',
    label: 'Research Assistant',
    icon: '🔬',
    configKey: 'notes',
    system:
      'You are the CLINICAL Rx research assistant. Help form research questions, organise reading and plan studies. Distinguish clearly between the student\'s stored local knowledge and general knowledge. Never fabricate citations or claim to have read a paper.',
  },
};

// ---- Intent detection --------------------------------------------------

export type AiIntent =
  | 'search'
  | 'explain'
  | 'quiz'
  | 'summarise-period'
  | 'weak-areas'
  | 'navigate'
  | 'general';

export interface DetectedIntent {
  intent: AiIntent;
  /** Date range implied by the query, e.g. "this week". */
  range?: { from: string; to: string };
  /** Academic level mentioned, e.g. "Level 200". */
  level?: string;
  /** Cleaned search terms. */
  terms: string;
}

const STOPWORDS = new Set([
  'what','did','i','learn','learned','about','show','me','find','all','my','the','a','an','of','on','in','for','to','and','or','is','are','was','were','have','has','do','does','tell','give','list','everything','explain','from','with','this','that','during','last','please','can','you','help',
]);

/** Cheap local intent detection — no model call, so it works offline. */
export function detectIntent(query: string): DetectedIntent {
  const q = query.toLowerCase();
  const today = todayIso();

  let range: { from: string; to: string } | undefined;
  if (/\bthis week\b|\bthe week\b/.test(q)) {
    const w = weekBounds(today);
    range = { from: w.start, to: w.end };
  } else if (/\blast week\b/.test(q)) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const w = weekBounds(iso);
    range = { from: w.start, to: w.end };
  } else if (/\btoday\b/.test(q)) {
    range = { from: today, to: today };
  } else if (/\bthis month\b/.test(q)) {
    const d = new Date(today + 'T00:00:00');
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    range = { from, to: today };
  }

  const levelMatch = /\blevel\s*(\d{3})\b/.exec(q);
  const level = levelMatch ? levelMatch[1] : undefined;

  let intent: AiIntent = 'general';
  if (/\bquiz\b|\btest me\b|\bpractice questions?\b/.test(q)) intent = 'quiz';
  else if (/\bweak\b|\bstruggl\w*\b|\bgaps?\b|\bdifficult\b/.test(q)) intent = 'weak-areas';
  else if (/\bsummar\w+\b|\banalys\w+\b|\bwhat did i (learn|do)\b/.test(q)) intent = 'summarise-period';
  else if (/\bfind\b|\bsearch\b|\bshow me\b|\blist\b|\ball my\b/.test(q)) intent = 'search';
  else if (/\bexplain\b|\bwhat is\b|\bhow does\b|\bmechanism\b|\bwhy\b/.test(q)) intent = 'explain';
  else if (/\bopen\b|\btake me\b|\bgo to\b|\bnavigate\b/.test(q)) intent = 'navigate';

  const terms = q
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d{3}$/.test(w))
    .slice(0, 8)
    .join(' ');

  return { intent, range, level, terms };
}

// ---- Configuration -----------------------------------------------------

/**
 * Which modules have a key in the secure vault. Populated by refreshKeyCache()
 * so the synchronous availability check stays synchronous.
 */
const vaultKeys = new Set<string>();

export async function refreshKeyCache(): Promise<void> {
  const all = useData.getState().settings?.ai ?? {};
  vaultKeys.clear();
  for (const key of Object.keys(all)) {
    try {
      const st = await getKeyStatus(key);
      if (st.present) vaultKeys.add(key);
    } catch {
      /* ignore */
    }
  }
}

/** True when a key exists for this config key, in the vault or in settings. */
function hasKey(configKey: string, cfg?: AiModuleConfig | null): boolean {
  return vaultKeys.has(configKey) || !!cfg?.apiKey?.trim() || !!getKeyForRequest(configKey);
}

/** Per-module config, falling back to a shared key from any enabled module. */
export function personaConfig(persona: AiPersona): AiModuleConfig | null {
  const all = useData.getState().settings?.ai ?? {};
  const def = PERSONAS[persona];
  const own = all[def.configKey];

  // A module's own settings always win — changing Clinical AI must never leak
  // into the other modules.
  if (own?.enabled && hasKey(def.configKey, own)) {
    return { ...own, apiKey: own.apiKey || getKeyForRequest(def.configKey) || '' };
  }

  // If this module has no key of its own, borrow another module's credential
  // so a single key makes the whole app work — but keep THIS module's
  // provider, model, temperature, mode and instructions.
  for (const [k, c] of Object.entries(all)) {
    if (k === def.configKey || !c) continue;
    if (c.enabled && hasKey(k, c)) {
      return {
        ...(own ?? c),
        enabled: own?.enabled ?? true,
        apiKey: c.apiKey || getKeyForRequest(k) || '',
        provider: own?.provider ?? c.provider,
        model: own?.model || c.model,
        baseUrl: own?.baseUrl || c.baseUrl,
      };
    }
  }
  return own ?? null;
}

/** The config key a persona reads/writes — used by the settings UI. */
export function personaConfigKey(persona: AiPersona): string {
  return PERSONAS[persona].configKey;
}

export function personaMode(persona: AiPersona): AiRuntimePreference {
  return (personaConfig(persona)?.mode as AiRuntimePreference) ?? 'auto';
}

export interface AiAvailability {
  online: boolean;
  cloud: boolean;
  local: boolean;
  /** What would actually run right now for this persona. */
  effective: AiRuntime | 'none';
  reason?: string;
}

export function availability(persona: AiPersona = 'general'): AiAvailability {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const cfg = personaConfig(persona);

  // Always ask the REGISTERED providers, never a specific implementation —
  // that is what makes the runtime swappable.
  const cloudProv = getProvider('cloud');
  const localProv = getProvider('local');
  const cloud = !!cfg?.enabled && !!cloudProv && (cloudProv.isAvailable(cfg) || hasKey(PERSONAS[persona].configKey, cfg));
  const local = !!localProv && localProv.isAvailable(cfg);
  const mode = personaMode(persona);

  let effective: AiRuntime | 'none' = 'none';
  let reason: string | undefined;

  if (mode === 'local') {
    effective = local ? 'local' : 'none';
    if (!local) reason = 'Local-only mode is selected but no local AI model was detected.';
  } else if (mode === 'cloud') {
    effective = cloud && online ? 'cloud' : 'none';
    if (!cloud) reason = 'Cloud-only mode is selected but no API key is configured.';
    else if (!online) reason = 'Cloud-only mode is selected but you are offline.';
  } else {
    // AUTO: prefer local (free, private, offline), then cloud.
    if (local) effective = 'local';
    else if (cloud && online) effective = 'cloud';
    else {
      effective = 'none';
      reason = online
        ? 'No local AI model is installed and no cloud API key is configured.'
        : 'Internet is unavailable and no local AI model is configured.';
    }
  }
  return { online, cloud, local, effective, reason };
}

// ---- Logging -----------------------------------------------------------

const LOG_KEY = 'clinical-rx:ai-log';
const MAX_LOG = 200;

export function aiLog(): AiLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pushLog(entry: AiLogEntry): void {
  try {
    const list = [entry, ...aiLog()].slice(0, MAX_LOG);
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch {
    /* logging must never break a request */
  }
}

export function clearAiLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* ignore */
  }
}

export interface AiUsageSummary {
  requests: number;
  failures: number;
  approxTokens: number;
  byModule: Record<string, number>;
  byRuntime: Record<string, number>;
}

export function aiUsage(): AiUsageSummary {
  const log = aiLog();
  const summary: AiUsageSummary = { requests: log.length, failures: 0, approxTokens: 0, byModule: {}, byRuntime: {} };
  for (const e of log) {
    if (!e.ok) summary.failures++;
    summary.approxTokens += e.approxTokens ?? 0;
    summary.byModule[e.module] = (summary.byModule[e.module] ?? 0) + 1;
    summary.byRuntime[e.runtime] = (summary.byRuntime[e.runtime] ?? 0) + 1;
  }
  return summary;
}

// ---- The main entry point ---------------------------------------------

export interface AskOptions {
  persona?: AiPersona;
  /** The user's question. */
  query: string;
  /** Focus a specific record ("Ask AI about this"). */
  focus?: { module: string; id: string };
  /** Prior turns of THIS conversation (short-term memory). */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Extra retrieval scoping. */
  retrieval?: Partial<RetrieveOptions>;
  /** Skip retrieval entirely (pure reasoning). */
  noContext?: boolean;
  onToken?: (t: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}

export interface AiSource {
  type: string;
  id: string;
  title: string;
  date?: string;
  academicLabel?: string;
}

export interface AskResult {
  ok: boolean;
  text: string;
  error?: string;
  runtime: AiRuntime | 'none';
  /** Records that were actually given to the model — shown as "Sources". */
  sources: AiSource[];
  intent: DetectedIntent;
  durationMs: number;
  /** Set when AUTO silently changed runtime, so the UI can tell the user. */
  fallbackNotice?: string;
}

/** Build the retrieval options for a query + persona. */
function retrievalFor(opts: AskOptions, intent: DetectedIntent): RetrieveOptions {
  const persona = PERSONAS[opts.persona ?? 'general'];
  const base: RetrieveOptions = {
    query: intent.terms || opts.query,
    limit: 24,
    includeRelationships: true,
  };
  if (intent.range) {
    base.dateRange = { from: intent.range.from, to: intent.range.to };
    // A period question wants everything in the period, not a keyword match.
    if (intent.intent === 'summarise-period' || intent.intent === 'quiz') base.query = '';
  }
  if (intent.level) base.academicLevel = intent.level;
  if (persona.preferredSources && !intent.range) base.modules = persona.preferredSources;
  if (intent.intent === 'weak-areas') base.modules = ['revision', 'question', 'lesson'];
  return { ...base, ...(opts.retrieval ?? {}) };
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Ask the AI. This is the ONLY function the UI should call.
 */
export async function askAi(opts: AskOptions): Promise<AskResult> {
  const started = Date.now();
  const persona = opts.persona ?? 'general';
  const def = PERSONAS[persona];
  const intent = detectIntent(opts.query);

  // --- 1. Availability + provider selection ---
  installLocalProvider();
  if (!localReady()) await detectLocalAi();
  const avail = availability(persona);

  const fail = (error: string, runtime: AiRuntime | 'none' = 'none'): AskResult => {
    const durationMs = Date.now() - started;
    pushLog({ id: uid(), ts: Date.now(), module: persona, runtime, ok: false, durationMs, error });
    return { ok: false, text: '', error, runtime, sources: [], intent, durationMs };
  };

  if (avail.effective === 'none') {
    return fail(avail.reason ?? 'No AI provider is available.');
  }

  // --- 2. Targeted retrieval (never the whole database) ---
  let contextText = '';
  let sources: AiSource[] = [];
  let contextRecords = 0;

  if (!opts.noContext) {
    try {
      if (opts.focus) {
        const rc = contextForRecord(opts.focus.module, opts.focus.id);
        if (rc.focus) {
          const lines = [
            `FOCUS RECORD — ${rc.focus.title}${rc.focus.academicLabel ? ` [${rc.focus.academicLabel}]` : ''}`,
            rc.focus.summary,
          ];
          if (rc.related.length) {
            lines.push('', 'CONNECTED RECORDS:');
            for (const r of rc.related) lines.push(`- [${r.type}] ${r.title}${r.summary ? `: ${r.summary}` : ''}`);
          }
          contextText = lines.join('\n');
          sources = [rc.focus, ...rc.related].map((r) => ({
            type: String(r.module ?? r.type),
            id: r.id,
            title: r.title,
            date: r.date,
            academicLabel: r.academicLabel,
          }));
          contextRecords = sources.length;
        }
      } else {
        const result = retrieveKnowledge(retrievalFor(opts, intent));
        contextText = formatForAi(result);
        sources = result.records.map((r) => ({
          type: String(r.module),
          id: r.id,
          title: r.title,
          date: r.date,
          academicLabel: r.academicLabel,
        }));
        contextRecords = result.total;
      }
    } catch {
      contextText = '';
    }
  }

  // --- 3. Build the prompt ---
  const st = useData.getState();
  const profile = st.profile;
  const stage = getStage(profile?.currentStageId);
  const cfg = personaConfig(persona);

  const system = [
    def.system,
    SAFETY,
    `STUDENT: ${profile?.username ?? 'Student'}, ${profile?.programme ?? 'Pharmacy'}${stage ? `, ${stage.name} (${stage.academicYear})` : ''}.`,
    contextText
      ? `RETRIEVED FROM THE STUDENT'S CLINICAL Rx RECORDS (${contextRecords} record(s)). These are their own stored notes — treat them as the source of truth and cite them naturally:\n${contextText}`
      : 'No stored records matched this query. Say so rather than inventing any.',
    cfg?.instructions?.trim() ? `ADDITIONAL INSTRUCTIONS: ${cfg.instructions.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const req: AiGenerateRequest = {
    system,
    prompt: opts.query,
    history: opts.history,
    maxTokens: opts.maxTokens ?? 1200,
    temperature: opts.temperature ?? cfg?.temperature ?? 0.7,
    onToken: opts.onToken,
  };

  // --- 4. Execute, with AUTO fallback ---
  const order: AiRuntime[] = avail.effective === 'local' ? ['local'] : ['cloud'];
  const mode = personaMode(persona);
  if (mode === 'auto') {
    if (avail.effective === 'local' && avail.cloud && avail.online) order.push('cloud');
    else if (avail.effective === 'cloud' && avail.local) order.push('local');
  }

  let lastError = 'AI request failed.';
  let fallbackNotice: string | undefined;

  for (let i = 0; i < order.length; i++) {
    const runtime = order[i];
    const provider = getProvider(runtime);
    if (!provider) continue;
    if (i > 0) {
      fallbackNotice =
        runtime === 'local'
          ? 'Cloud provider unavailable — switched to Local AI.'
          : 'Local AI unavailable — switched to the cloud provider.';
    }
    const res = await provider.generate(req, cfg);
    const durationMs = Date.now() - started;
    if (res.ok) {
      pushLog({
        id: uid(),
        ts: Date.now(),
        module: persona,
        runtime,
        provider: runtime === 'cloud' ? cfg?.provider : 'local',
        model: runtime === 'cloud' ? cfg?.model : cfg?.localModel,
        ok: true,
        durationMs,
        approxTokens: approxTokens(system) + approxTokens(opts.query) + approxTokens(res.text),
        contextRecords,
      });
      return { ok: true, text: res.text, runtime, sources, intent, durationMs, fallbackNotice };
    }
    lastError = res.error;
  }

  return fail(lastError, order[0] ?? 'none');
}

// ---- Diagnostics -------------------------------------------------------

export interface DiagnosticResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

/** Test AI — checks every layer and explains any problem in plain language. */
export async function runDiagnostics(): Promise<DiagnosticResult[]> {
  const out: DiagnosticResult[] = [];
  const st = useData.getState();

  out.push({
    name: 'Local database',
    status: st.ready ? 'pass' : 'fail',
    detail: st.ready ? 'Local store loaded.' : 'The local store did not initialise.',
  });

  try {
    const probe = retrieveKnowledge({ limit: 1 });
    out.push({
      name: 'Intelligence Layer',
      status: 'pass',
      detail: `Retrieval working — ${probe.total} record(s) reachable from the registered sources.`,
    });
  } catch (e: any) {
    out.push({ name: 'Intelligence Layer', status: 'fail', detail: e?.message ?? 'Retrieval failed.' });
  }

  out.push({
    name: 'Offline search',
    status: 'pass',
    detail: 'Deterministic search does not depend on AI and always works.',
  });

  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  out.push({
    name: 'Internet',
    status: online ? 'pass' : 'warn',
    detail: online ? 'Online.' : 'Offline — cloud AI unavailable, local AI can still run.',
  });

  const cfg = personaConfig('general');
  out.push({
    name: 'Cloud AI',
    status: cfg?.apiKey?.trim() ? 'pass' : 'warn',
    detail: cfg?.apiKey?.trim()
      ? `Configured (${cfg.provider}${cfg.model ? ` · ${cfg.model}` : ''}).`
      : 'No API key configured. Add one in Settings → AI, or use Local AI.',
  });

  installLocalProvider();
  const { runtime, models } = await detectLocalAi(true);
  out.push({
    name: 'Local AI',
    status: runtime ? 'pass' : 'warn',
    detail: runtime
      ? `${runtime.label} detected at ${runtime.baseUrl} with ${models.length} model(s).`
      : 'No local runtime detected. Install Ollama and pull a model to use AI offline.',
  });

  const avail = availability('general');
  out.push({
    name: 'Effective AI',
    status: avail.effective === 'none' ? 'fail' : 'pass',
    detail:
      avail.effective === 'none'
        ? avail.reason ?? 'No provider available.'
        : `Requests will run on ${avail.effective === 'local' ? 'Local AI' : 'Cloud AI'}.`,
  });

  return out;
}
