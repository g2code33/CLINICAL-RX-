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
/**
 * Health API catalog. Grouped so the workbench can switch between categories
 * (like the AI module switcher). `id`s are stable — they are used as the
 * storage key under `settings.healthApis`, so renaming labels won't lose a key.
 *
 * `functional: true`  → has a usable search UI in the workbench (may need a key).
 * `functional: false` → key entry + link-outs only (enterprise/contact-sales).
 */
export type HealthApiCategory = 'gov' | 'commercial' | 'ehr' | 'wearables';

export interface HealthApiMeta {
  id: string;
  name: string;
  category: HealthApiCategory;
  data: string;
  access: string;
  docs: string;
  url: string;
  requiresKey: boolean;
  functional: boolean;
  keyPlaceholder?: string;
  baseUrlPlaceholder?: string;
}

export const HEALTH_API_CATEGORIES: { id: HealthApiCategory; label: string; blurb: string }[] = [
  { id: 'gov',        label: 'Government & Open Data', blurb: 'Free NLM / FDA / NCBI sources' },
  { id: 'commercial', label: 'Drug Data & Clinical AI', blurb: 'Commercial references & medical reasoning' },
  { id: 'ehr',        label: 'EHR Interoperability',   blurb: 'FHIR / hospital system connectors' },
  { id: 'wearables',  label: 'Wearables & Trackers',    blurb: 'Biometric ingestion from devices' },
];

export const HEALTH_APIS: HealthApiMeta[] = [
  // — Government & Open Data —
  { id: 'openfda',  category: 'gov', name: 'openFDA',         url: 'https://open.fda.gov/',                         data: 'Drug labels, adverse events, FDA recalls',         access: 'Free · API key optional (api.data.gov raises rate limit)', docs: 'https://open.fda.gov/apis/',                requiresKey: false, functional: true, keyPlaceholder: 'Optional — api.data.gov key' },
  { id: 'rxnav',    category: 'gov', name: 'RxNav (NLM)',      url: 'https://lhncbc.nlm.nih.gov/RxNav/',             data: 'RxNorm identifiers & drug–drug interactions',     access: 'Free · no key required',                                      docs: 'https://rxnav.nlm.nih.gov/',               requiresKey: false, functional: true, keyPlaceholder: 'Usually not required' },
  { id: 'dailymed', category: 'gov', name: 'DailyMed (NLM)',   url: 'https://dailymed.nlm.nih.gov/',                 data: 'Official FDA Structured Product Labeling (SPL)',  access: 'Free · no key required',                                      docs: 'https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm', requiresKey: false, functional: true },
  { id: 'pubmed',   category: 'gov', name: 'PubMed (NCBI)',    url: 'https://pubmed.ncbi.nlm.nih.gov/',              data: 'Biomedical literature search with citations',     access: 'Free · key optional (raises rate limit to 10/s)',             docs: 'https://www.ncbi.nlm.nih.gov/home/develop/api/', requiresKey: false, functional: true, keyPlaceholder: 'Optional NCBI API key' },
  { id: 'umls',     category: 'gov', name: 'UMLS (NLM)',       url: 'https://www.nlm.nih.gov/research/umls/',        data: 'SNOMED CT, ICD-10, RxNorm terminology mapping',  access: 'Free with UTS account',                                       docs: 'https://uts.nlm.nih.gov/uts/',            requiresKey: true,  functional: true, keyPlaceholder: 'UTS API key' },

  // — Drug Data & Clinical AI —
  { id: 'drugbank',    category: 'commercial', name: 'DrugBank',           url: 'https://www.drugbank.com/',                data: 'Structured drug data, targets, pathways', access: 'Commercial · API key',       docs: 'https://docs.drugbank.com/', requiresKey: true, functional: true, keyPlaceholder: 'Bearer token',      baseUrlPlaceholder: 'https://api.drugbank.com/v1' },
  { id: 'goodrx',      category: 'commercial', name: 'GoodRx',              url: 'https://www.goodrx.com/',                 data: 'Real-time US drug pricing & coupons',    access: 'Partner program · API key',  docs: 'https://www.goodrx.com/healthcare-professionals/api', requiresKey: true, functional: true, keyPlaceholder: 'Bearer token', baseUrlPlaceholder: 'https://api.goodrx.com/v1' },
  { id: 'webmd',       category: 'commercial', name: 'RxList / WebMD',      url: 'https://www.rxlist.com/',                 data: 'Consumer monographs & interaction checker (link-out)', access: 'No public JSON API — deep links', docs: 'https://www.rxlist.com/', requiresKey: false, functional: true },
  { id: 'fdb',         category: 'commercial', name: 'FDB (First Databank)',url: 'https://www.fdbhealth.com/',              data: 'Enterprise clinical decision support',   access: 'Enterprise license required', docs: 'https://www.fdbhealth.com/', requiresKey: false, functional: false },
  { id: 'evidencemd',  category: 'commercial', name: 'EvidenceMD',          url: 'https://evidencemd.ai/',                  data: 'Peer-reviewed medical Q&A with PubMed citations', access: 'Commercial · API key', docs: 'https://evidencemd.ai/', requiresKey: true, functional: true, keyPlaceholder: 'Bearer token', baseUrlPlaceholder: 'https://api.evidencemd.ai/v1' },
  { id: 'infermedica', category: 'commercial', name: 'Infermedica',         url: 'https://www.infermedica.com/',            data: 'Symptom checker & triage AI',            access: 'Commercial · App-Id + App-Key', docs: 'https://developer.infermedica.com/', requiresKey: true, functional: true, keyPlaceholder: 'Format: app-id:app-key', baseUrlPlaceholder: 'https://api.infermedica.com/v3' },

  // — EHR Interoperability —
  { id: 'redox',            category: 'ehr', name: 'Redox',                url: 'https://www.redoxengine.com/',            data: 'EHR integration (Epic/Cerner/Athena)',  access: 'Enterprise agreement', docs: 'https://developer.redoxengine.com/', requiresKey: false, functional: false },
  { id: 'particle',         category: 'ehr', name: 'Particle Health',      url: 'https://www.particlehealth.com/',         data: 'Unified FHIR medical records',          access: 'Enterprise agreement', docs: 'https://www.particlehealth.com/developers', requiresKey: false, functional: false },
  { id: 'metriport',        category: 'ehr', name: 'Metriport',            url: 'https://www.metriport.com/',              data: 'Medical device + FHIR data API',         access: 'Enterprise / developer', docs: 'https://docs.metriport.com/', requiresKey: true, functional: false, keyPlaceholder: 'API key' },
  { id: 'googleHealthcare', category: 'ehr', name: 'Google Cloud Healthcare', url: 'https://cloud.google.com/healthcare-api', data: 'FHIR / HL7v2 / DICOM on GCP',          access: 'GCP account + OAuth', docs: 'https://cloud.google.com/healthcare-api/docs', requiresKey: true, functional: false, keyPlaceholder: 'GCP OAuth' },

  // — Wearables —
  { id: 'terra',    category: 'wearables', name: 'Terra API',     url: 'https://tryterra.co/',    data: '500+ wearables normalized to JSON (Apple Health, Fitbit, Garmin, CGMs)', access: 'Developer · API key',  docs: 'https://docs.tryterra.co/', requiresKey: true, functional: false, keyPlaceholder: 'Dev-ID x-api-key' },
  { id: 'spikeApi', category: 'wearables', name: 'SpikeAPI',      url: 'https://spikeapi.com/',   data: 'Real-time biometrics from wearables & CGMs',                              access: 'Developer · API key',  docs: 'https://spikeapi.com/docs', requiresKey: true, functional: false, keyPlaceholder: 'API key' },
];

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
