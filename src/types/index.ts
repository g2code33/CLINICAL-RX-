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
  | 'quiz'
  | 'reminder'
  | 'wardRound'
  | 'wardEntry'
  | 'wardAnalysis'
  | 'academicStage'
  | 'academicPeriod'
  | 'course';

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
  // ---- Academic identity (Phase 1 foundation) ----
  institution?: string;
  academicYear?: string; // e.g. "2026/2027"
  currentStageId?: string; // -> AcademicStage.id
  currentPeriodId?: string; // -> AcademicPeriod.id (semester)
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
  autoBackup?: 'off' | 'daily' | 'weekly';
  lastAutoBackup?: number; // epoch ms of last automatic backup
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
  sample?: boolean; // true when created from demo/sample data
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
  weekly?: boolean; // true for auto-generated weekly quizzes
  weekStart?: string; // yyyy-mm-dd Monday of the covered week
}

// ---- Calendar reminders (persisted, synced, desktop notifications) ----

export interface Reminder extends BaseRecord {
  title: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  note?: string;
  done: boolean;
}

// ---- Ward Rounds ------------------------------------------------------
// A ward round is a fast capture session for CLINICAL LEARNING during an
// active round. It records what the STUDENT encountered and learned — it is
// explicitly NOT a patient record: no names, IDs, demographics or contact
// details are modelled anywhere in these types.

export type WardRoundStatus = 'active' | 'completed';

export interface WardRound extends BaseRecord {
  ward: string; // e.g. "Medical Ward" (free text, presets offered in the UI)
  date: string; // yyyy-mm-dd
  focus: string; // e.g. "Pharmacotherapy" — optional learning focus
  status: WardRoundStatus;
  startedAt: number;
  completedAt?: number;
  archived?: boolean;
  dayId?: string; // linked ClinicalDay (same date), if any
  sample?: boolean; // created by demo/sample data
  /** Academic context at capture time (stage / semester / year). */
  academic?: AcademicLink;
}

/** The six capture types available during a round. */
export type WardEntryType = 'learning' | 'medicine' | 'condition' | 'investigation' | 'question' | 'note';

export interface WardEntry extends BaseRecord {
  roundId: string;
  type: WardEntryType;
  title: string; // short subject, e.g. "Amlodipine" (may be empty for notes)
  content: string; // the student's own words — NEVER modified by AI
  priority: 'high' | 'medium' | 'low';
  /**
   * AI's structured interpretation of this entry, stored SEPARATELY from the
   * student's original `content`. Only set once the student accepts it.
   */
  aiSuggestion?: WardEntryAiSuggestion;
  /** Set when the entry has been pushed into Diseases/Medicines/etc. */
  linkedRecordId?: string;
}

export interface WardEntryAiSuggestion {
  acceptedAt: number;
  model?: string;
  className?: string;
  mechanism?: string;
  adverseEffects?: string[];
  keyPoints?: string[];
  answer?: string;
  raw?: string;
}

/**
 * AI output for a whole round. Kept in its own module so AI-generated content
 * can never overwrite the student's captured learning.
 */
export interface WardAnalysis extends BaseRecord {
  roundId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  model?: string;
  summary: string;
  keyLearningPoints: string[];
  knowledgeGaps: string[];
  questions: string[];
  revisionRecommendations: string[];
  connections: string[];
  difficultTopics: string[];
  raw?: string;
  error?: string;
  attempts: number;
}

// ---- Academic journey (Phase 1 foundation) ---------------------------
// A longitudinal, ADDITIVE model of the user's studies. Progressing to a new
// stage never deletes anything: the old stage becomes `completed` and stays
// fully accessible. Stages are data, not hard-coded enums, so future
// professional stages (internship, residency, CPD) drop straight in.

export type StageStatus = 'completed' | 'current' | 'upcoming';

export interface AcademicStage extends BaseRecord {
  name: string; // "Level 200" — display name
  level: string; // "200" — sortable/identifying token
  academicYear: string; // "2026/2027"
  status: StageStatus;
  order: number; // explicit ordering along the timeline
  startDate?: string; // yyyy-mm-dd (user-configurable)
  endDate?: string; // yyyy-mm-dd
  institution?: string;
  programme?: string;
  completedAt?: number; // set when the stage is archived by a promotion
  note?: string;
}

/**
 * An academic period inside a stage — a semester, term, trimester or block.
 * Data-driven so institutions that don't use exactly two semesters are fine.
 */
export interface AcademicPeriod extends BaseRecord {
  stageId: string;
  name: string; // "Semester 1"
  index: number; // 1-based position within the stage
  startDate?: string;
  endDate?: string;
}

/** Course foundation — belongs to a stage and (optionally) a period. */
export interface Course extends BaseRecord {
  stageId: string;
  periodId?: string;
  title: string;
  code?: string;
  credits?: number;
  note?: string;
}

/**
 * Academic context stamped onto learning records so future bundlers can slice
 * data by stage/year/semester across the whole PharmD journey.
 * Optional everywhere: records created before this existed remain valid.
 */
export interface AcademicLink {
  stageId?: string;
  periodId?: string;
  academicYear?: string;
}
