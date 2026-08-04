export type ModuleType =
  | 'profile'
  | 'settings'
  | 'day'
  | 'disease'
  | 'medicine'
  | 'investigation'
  | 'question'
  | 'lesson'
  | 'revision'
  | 'bundle'
  | 'chat'
  | 'quiz';

export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Profile extends BaseRecord {
  username: string;
  programme: string;
  level: string;
  site: string;
  clinicalDay: number;
}

export type AppearanceMode = 'light' | 'dark' | 'system';

export type AiProvider = 'openai' | 'anthropic' | 'openrouter' | 'nvidia' | 'custom';

export interface AiModuleConfig {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface Settings extends BaseRecord {
  appearance: AppearanceMode;
  clinicalSite: string;
  course: string;
  autoDailyBundle: boolean;
  autoWeeklyBundle: boolean;
  ai: Record<string, AiModuleConfig>; // keyed by module name
  learningProfile: {
    preferredExplanation: string[];
  };
  onlineAccount: {
    connected: boolean;
    email?: string;
    name?: string;
    token?: string;
    backendUrl?: string; // '' or '/' = same origin (/api); else e.g. https://you.vercel.app
    lastSynced?: number;
    syncing?: boolean;
  };
  aiPendingBundles: string[]; // bundle ids awaiting AI enrichment once online
}

export interface ClinicalDay extends BaseRecord {
  date: string; // yyyy-mm-dd
  site: string;
  dayNumber: number;
  conditions: string[];
  medicines: string[];
  investigations: string[];
  observations: string[];
  lessons: string[];
  uncertainties: string[];
  topicsToResearch: string[];
}

export interface Disease extends BaseRecord {
  name: string;
  who: string;
  what: string;
  where: string;
  why: string;
  how: string;
  dt: string; // diagnostic tests
  symptoms: string[];
  medicines: string[];
  clinicalReasoning: string;
  encounters: number;
  lastSeen: string; // yyyy-mm-dd
  revision: { etiology: boolean; pathogenesis: boolean; clinical: boolean; diagnosis: boolean; treatment: boolean; counselling: boolean };
}

export interface Medicine extends BaseRecord {
  name: string;
  className: string;
  mechanism: string;
  indications: string[];
  dosage: string;
  routes: string[];
  contraindications: string[];
  adverseEffects: string[];
  interactions: string[];
  counselling: string;
  encounters: number;
  lastSeen: string;
}

export interface Investigation extends BaseRecord {
  name: string;
  whyRequested: string;
  result: string;
  referenceRange: string;
  interpretation: string;
  clinicalSignificance: string;
  linkedConditions: string[];
  encounters: number;
  lastSeen: string;
}

export interface Question extends BaseRecord {
  text: string;
  category: 'pharmacology' | 'pathology' | 'microbiology' | 'therapeutics' | 'clinical-pharmacy' | 'other';
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'answered';
  answer?: string;
}

export interface Lesson extends BaseRecord {
  title: string;
  content: string;
  date: string;
  important: boolean;
}

export interface RevisionItem extends BaseRecord {
  topic: string;
  module: string;
  items: string[];
  due: boolean;
  reviewedAt?: number;
  // Spaced repetition (Leitner): box 0 = new, 1..5 = increasing intervals
  box?: number;
  nextReview?: number; // epoch ms when it becomes due again
  failCount?: number;
  passCount?: number;
}

export type BundleType = 'auto-daily' | 'auto-weekly' | 'manual-day' | 'manual-week' | 'manual-custom' | 'merged';

export interface Bundle extends BaseRecord {
  type: BundleType;
  title: string;
  periodStart: string;
  periodEnd: string;
  aiModel?: string;
  aiPending?: boolean; // true when created offline/without AI, waiting to be enriched once online
  summary: string;
  knowledgeGaps: string[];
  recommendedRevision: string[];
  highlights: string[];
  stats: Record<string, number>;
  sourceIds: string[]; // ids of records included
  sourceBundleIds: string[]; // ids of bundles merged into this one (lineage)
  body: Record<string, unknown>;
  version: number;
  followUps: BundleFollowUp[];
}

export interface BundleFollowUp {
  id: string;
  createdAt: number;
  content: string;
}

// ---- Storage adapter contract (localStorage on web, SQLite via IPC on Electron) ----

export interface SyncRecord {
  module: string;
  id: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface PendingOp {
  op: 'upsert' | 'delete';
  module: ModuleType;
  id: string;
  data?: unknown;
  createdAt?: number;
  updatedAt?: number;
}

export interface KVItem {
  id: string;
  module: ModuleType;
  data: string;
  createdAt: number;
  updatedAt: number;
}

export interface StorageAdapter {
  isElectron: boolean;
  platform(): Promise<string>;
  list(module: ModuleType): Promise<KVItem[]>;
  get(module: ModuleType, id: string): Promise<any | null>;
  put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number): Promise<void>;
  remove(module: ModuleType, id: string): Promise<void>;
}

export interface BundleCreateInput {
  type: BundleType;
  title: string;
  periodStart: string;
  periodEnd: string;
  sourceModules?: ModuleType[];
  sourceBundleIds?: string[];
}

// ---- AI chat sessions (persisted per AI section, synced across devices) ----

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  ts: number;
  images?: string[]; // data URLs for user messages (AI vision)
}

export interface ChatSession extends BaseRecord {
  section: string; // AiModuleKey: chat | tutor | analyzer | notes | questionGen | revision | bundler
  title: string;
  messages: ChatMessage[];
  hidden?: boolean; // hidden from the chat list (can be shown again)
}

// ---- Saved / completed quizzes (persisted, reviewable anytime) ----

export interface SavedQuizQuestion {
  question: string;
  options: string[];
  answer: number; // index of correct option
  explanation: string;
}

export interface SavedQuiz extends BaseRecord {
  title: string;
  date: string; // yyyy-mm-dd when taken
  questions: SavedQuizQuestion[];
  answers: number[]; // user's chosen answers (-1 = skipped)
  score: number;
  total: number;
  durationSeconds: number;
}
