import { uid } from '../stores/data';
import type {
  AiProvider,
  Bundle,
  ChatSession,
  ClinicalDay,
  Disease,
  Investigation,
  Lesson,
  Medicine,
  Profile,
  Question,
  RevisionItem,
  SavedQuiz,
  Settings,
  WardAnalysis,
  WardEntry,
  WardEntryType,
  WardRound,
} from '../types';

export const AI_MODULES = [
  { key: 'chat', label: '🤖 General Assistant' },
  { key: 'tutor', label: '🩺 Clinical Assistant' },
  { key: 'revision', label: '📚 Revision Coach' },
  { key: 'search', label: '🔎 AI Search' },
  { key: 'bundler', label: '📦 Bundler AI' },
  { key: 'career', label: '🎓 Career Assistant' },
  { key: 'research', label: '🔬 Research Assistant' },
  { key: 'analyzer', label: '📊 AI Learning Analyzer' },
  { key: 'notes', label: '📝 AI Note Organizer' },
  { key: 'questionGen', label: '❓ AI Question Generator' },
  { key: 'wardRound', label: '🏥 Ward Round AI' },
] as const;

/**
 * 🩺 Study health APIs — curated list of real pharmaceutical/clinical data
 * APIs that help with studying. Separate from the AI LLM keys. Some are free
 * (openFDA, RxNav) and some require a free/commercial license (UMLS, WebMD).
 *
 * The `id`s are stable — they are used as the storage key under
 * `settings.healthApis`, so renaming here won't lose a saved key.
 */
export const HEALTH_APIS = [
  {
    id: 'openfda',
    icon: '💊',
    name: 'openFDA API',
    url: 'https://open.fda.gov/',
    data: 'Drug labels, adverse events, recalls',
    access: '🆓 Free public dataset · API key optional (raises rate limit)',
    docs: 'https://open.fda.gov/apis/',
    requiresKey: false,
    keyPlaceholder: 'Optional — register at api.data.gov for higher rate limits',
  },
  {
    id: 'rxnav',
    icon: '🔗',
    name: 'RxNav API (NLM)',
    url: 'https://lhncbc.nlm.nih.gov/RxNav/',
    data: 'Drug-to-drug interactions, RxNorm mapping, clinical drug identifiers',
    access: '🆓 Free API · no key required for basic use',
    docs: 'https://rxnav.nlm.nih.gov/',
    requiresKey: false,
    keyPlaceholder: 'Usually not required',
  },
  {
    id: 'umls',
    icon: '📖',
    name: 'UMLS (Unified Medical Language System)',
    url: 'https://www.nlm.nih.gov/research/umls/index.html',
    data: 'SNOMED CT, ICD-10, RxNorm vocabulary & terminology mapping',
    access: '🆓 Free license (UMLS Terminology Services account)',
    docs: 'https://uts.nlm.nih.gov/uts/',
    requiresKey: true,
    keyPlaceholder: 'UTS API key (from your UMLS profile)',
  },
  {
    id: 'webmd',
    icon: '🌐',
    name: 'RxList / WebMD Network API',
    url: 'https://www.webmd.com/',
    data: 'Consumer drug monographs, disease articles, interactions',
    access: '💼 Commercial license required (Medscape/WebMD network)',
    docs: 'https://developer.webmd.com/',
    requiresKey: true,
    keyPlaceholder: 'API key from WebMD/Medscape developer portal',
  },
] as const;

export type HealthApiId = (typeof HEALTH_APIS)[number]['id'];

export function defaultHealthApis() {
  const out: Record<string, { name: string; key: string; baseUrl?: string; enabled: boolean; notes?: string }> = {};
  for (const a of HEALTH_APIS) {
    out[a.id] = { name: a.name, key: '', enabled: false };
  }
  return out;
}

export function defaultAiConfig() {
  const conf: Record<string, { enabled: boolean; provider: AiProvider; apiKey: string; model: string; baseUrl?: string }> = {};
  for (const m of AI_MODULES) {
    conf[m.key] = { enabled: true, provider: 'openai', apiKey: '', model: 'gpt-4o-mini', baseUrl: '' };
  }
  return conf;
}

export function newProfile(username = ''): Profile {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    username,
    programme: 'Pharmacy',
    level: '200',
    site: 'Afrancho Polyclinic',
    clinicalDay: 1,
  };
}

export function newSettings(): Settings {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    appearance: 'system',
    clinicalSite: 'Afrancho Polyclinic',
    course: 'Pharmacy',
    autoDailyBundle: true,
    autoWeeklyBundle: true,
    ai: defaultAiConfig(),
    healthApis: defaultHealthApis(),
    learningProfile: { preferredExplanation: ['simple-first', 'step-by-step', 'pharmacy-focused', 'clinical-examples'] },
    onlineAccount: { connected: false },
    aiPendingBundles: [],
    autoBackup: 'off',
  };
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newDay(dayNumber: number, site: string): ClinicalDay {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    date: todayIso(),
    site,
    dayNumber,
    conditions: [],
    medicines: [],
    investigations: [],
    observations: [],
    lessons: [],
    uncertainties: [],
    topicsToResearch: [],
  };
}

export function newDisease(name = ''): Disease {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    name, who: '', what: '', where: '', why: '', how: '', dt: '',
    symptoms: [], medicines: [], clinicalReasoning: '', encounters: 1, lastSeen: todayIso(),
    revision: { etiology: false, pathogenesis: false, clinical: false, diagnosis: false, treatment: false, counselling: false },
  };
}

export function newMedicine(name = ''): Medicine {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    name, className: '', mechanism: '', indications: [], dosage: '', routes: [],
    contraindications: [], adverseEffects: [], interactions: [], counselling: '', encounters: 1, lastSeen: todayIso(),
  };
}

export function newInvestigation(name = ''): Investigation {  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    name, whyRequested: '', result: '', referenceRange: '', interpretation: '', clinicalSignificance: '',
    linkedConditions: [], encounters: 1, lastSeen: todayIso(),
  };
}

export function newLesson(title: string, date: string): Lesson {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    title, content: title, date, important: false,
  };
}

export function newQuestion(text = ''): Question {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    text, category: 'pharmacology', priority: 'high', status: 'open',
  };
}

export function newRevisionItem(topic: string): RevisionItem {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    topic, module: 'disease', items: [], due: true,
    box: 0, nextReview: Date.now(), failCount: 0, passCount: 0,
  };
}

export function newSavedQuiz(input: {
  title: string;
  questions: SavedQuiz['questions'];
  answers: number[];
  score: number;
  durationSeconds: number;
}): SavedQuiz {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    date: todayIso(),
    title: input.title,
    questions: input.questions,
    answers: input.answers,
    score: input.score,
    total: input.questions.length,
    durationSeconds: input.durationSeconds,
  };
}

export function newChatSession(section: string, title: string): ChatSession {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    section,
    title,
    messages: [],
  };
}

// ---- Ward Rounds ----

/** Ward presets offered in the "Start Ward Round" form (custom names allowed). */
export const WARD_PRESETS = [
  'Males Ward',
  'Females Ward',
  'Pediatric Ward',
  'Pregnancy Ward',
  'Emergency Ward',
  'Medical Ward',
  'Surgical Ward',
  'Outpatient Department',
  'Pharmacy',
] as const;

/** Optional learning-focus presets for a round. */
export const WARD_FOCUS_PRESETS = [
  'General',
  'Pharmacotherapy',
  'Pharmacology',
  'Clinical pharmacy',
  'Medicines',
  'Investigations',
] as const;

export const WARD_ENTRY_META: Record<
  WardEntryType,
  { icon: string; label: string; plural: string; placeholder: string; titleLabel?: string }
> = {
  learning: { icon: '💡', label: 'Learning Point', plural: 'Learning Points', placeholder: 'e.g. Amlodipine can cause ankle edema.' },
  medicine: { icon: '💊', label: 'Medicine', plural: 'Medicines', placeholder: 'What did I learn about it?', titleLabel: 'Medicine name' },
  condition: { icon: '🦠', label: 'Condition', plural: 'Conditions', placeholder: 'What did I learn about it?', titleLabel: 'Condition name' },
  investigation: { icon: '🧪', label: 'Investigation', plural: 'Investigations', placeholder: 'What did I learn / observe?', titleLabel: 'Investigation name' },
  question: { icon: '❓', label: 'Question', plural: 'Questions', placeholder: 'e.g. Why was losartan preferred?' },
  note: { icon: '📝', label: 'Quick Note', plural: 'Quick Notes', placeholder: 'Anything else worth remembering…' },
  reasoning: { icon: '🧠', label: 'Clinical Reasoning', plural: 'Clinical Reasoning', placeholder: 'What was being considered, and what did you make of it?' },
  reflection: { icon: '📖', label: 'Reflection', plural: 'Reflections', placeholder: 'What did you learn? What surprised you? What will you study next?' },
};

export function newWardRound(ward: string, date: string, focus = 'General'): WardRound {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    ward,
    date,
    focus,
    status: 'active',
    startedAt: now,
  };
}

export function newWardEntry(roundId: string, type: WardEntryType, title: string, content: string): WardEntry {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    roundId,
    type,
    title: title.trim(),
    content: content.trim(),
    priority: 'medium',
  };
}

export function newWardAnalysis(roundId: string): WardAnalysis {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    roundId,
    status: 'pending',
    summary: '',
    keyLearningPoints: [],
    knowledgeGaps: [],
    questions: [],
    revisionRecommendations: [],
    connections: [],
    difficultTopics: [],
    attempts: 0,
  };
}

export function emptyBundle(type: Bundle['type'], title: string, periodStart: string, periodEnd: string): Bundle {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    type, title, periodStart, periodEnd, aiModel: undefined,
    summary: '', knowledgeGaps: [], recommendedRevision: [], highlights: [],
    stats: {}, sourceIds: [], sourceBundleIds: [], body: {}, version: 1, followUps: [],
  };
}
