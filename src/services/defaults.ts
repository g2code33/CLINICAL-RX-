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
  { key: 'tutor', label: '🧑‍🏫 AI Clinical Tutor' },
  { key: 'analyzer', label: '🩺 AI Case / Learning Analyzer' },
  { key: 'notes', label: '📝 AI Note Organizer' },
  { key: 'questionGen', label: '❓ AI Question Generator' },
  { key: 'revision', label: '📚 AI Revision Coach' },
  { key: 'chat', label: '💬 AI Clinical Chat' },
  { key: 'bundler', label: '📦 AI Daily/Weekly Bundler' },
] as const;

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
