import { uid } from '../stores/data';
import type {
  AiProvider,
  Bundle,
  ChatSession,
  ClinicalDay,
  Disease,
  Investigation,
  Medicine,
  Profile,
  Question,
  RevisionItem,
  SavedQuiz,
  Settings,
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

export function newInvestigation(name = ''): Investigation {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    name, whyRequested: '', result: '', referenceRange: '', interpretation: '', clinicalSignificance: '',
    linkedConditions: [], encounters: 1, lastSeen: todayIso(),
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

export function emptyBundle(type: Bundle['type'], title: string, periodStart: string, periodEnd: string): Bundle {
  return {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    type, title, periodStart, periodEnd, aiModel: undefined,
    summary: '', knowledgeGaps: [], recommendedRevision: [], highlights: [],
    stats: {}, sourceIds: [], sourceBundleIds: [], body: {}, version: 1, followUps: [],
  };
}
