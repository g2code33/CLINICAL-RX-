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
  | 'course'
  | 'activity';

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
  /** Cloud / local / automatic execution preference for THIS module. */
  mode?: 'auto' | 'cloud' | 'local';
  temperature?: number;
  /** Extra persona instructions appended to the module's system prompt. */
  instructions?: string;
  /** Local model identifier when mode uses the local runtime. */
  localModel?: string;
}

/** One entry in the AI activity log. Never contains API keys. */
export interface AiLogEntry {
  id: string;
  ts: number;
  module: string;
  runtime: 'cloud' | 'local' | 'none';
  provider?: string;
  model?: string;
  ok: boolean;
  durationMs: number;
  approxTokens?: number;
  error?: string;
  /** How many knowledge records were retrieved for the request. */
  contextRecords?: number;
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
  /** Academic context at the time the day was logged. */
  academic?: AcademicLink;
}

export interface Disease extends BaseRecord, LearningMeta {
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

export interface Medicine extends BaseRecord, LearningMeta {
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

export interface Investigation extends BaseRecord, LearningMeta {
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

export interface Question extends BaseRecord, LearningMeta {
  text: string;
  category: 'pharmacology' | 'pathology' | 'microbiology' | 'therapeutics' | 'clinical-pharmacy' | 'other';
  priority: 'high' | 'medium' | 'low';
  /** 'open'/'answered' are the original values; the rest were added in Phase 2. */
  status: 'open' | 'answered' | 'researching' | 'review-later';
  answer?: string;
  /** Explicit links to the knowledge this question is about. */
  diseaseId?: string;
  medicineId?: string;
  investigationId?: string;
}

export interface Lesson extends BaseRecord, LearningMeta {
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
  /** Self-rated confidence 1 (don't understand) … 5 (confident). */
  confidence?: 1 | 2 | 3 | 4 | 5;
  /** What this revision item points at, so it can deep-link back. */
  sourceModule?: ModuleType;
  sourceId?: string;
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
  academic?: AcademicLink;

  // ---- Phase 4: immutable snapshot ----
  /**
   * Frozen copies of the records included when the bundle was generated.
   * A bundle is a SNAPSHOT, not a live query: editing a source record later
   * must never change an existing bundle.
   */
  snapshot?: BundleSnapshotItem[];
  /** How the bundle came to exist. */
  creationMethod?: 'automatic' | 'manual' | 'merge';
  status?: BundleStatus;
  generatedAt?: number;
  error?: string;
  /** Deterministic key preventing duplicate automatic bundles. */
  autoKey?: string;
  favorite?: boolean;
  notes?: string;
  tags?: string[];
  /** Modules the user selected for a custom bundle. */
  includedModules?: string[];
}

/** Immutable copy of one source record, frozen into a bundle snapshot. */
export interface BundleSnapshotItem {
  /** Original record id — lets the viewer offer "Open original". */
  sourceId: string;
  /** Source module/type, e.g. 'medicine' | 'wardRound' | 'lesson'. */
  sourceType: string;
  title: string;
  summary: string;
  date: string;
  academicLabel?: string;
  tags?: string[];
}

export type BundleStatus = 'pending' | 'generating' | 'completed' | 'failed';

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
  academic?: AcademicLink;
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
  /** Rotation this round belongs to, e.g. "Internal Medicine". */
  rotation?: string;
  /** What the student set out to learn. */
  objective?: string;
  /** End-of-round reflection (the student's own words). */
  reflection?: string;
  durationMinutes?: number;
}

/** The six capture types available during a round. */
export type WardEntryType =
  | 'learning'
  | 'medicine'
  | 'condition'
  | 'investigation'
  | 'question'
  | 'note'
  | 'reasoning'
  | 'reflection';

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
  /**
   * The canonical Clinical Learning record this entry points at
   * (disease / medicine / investigation / question / lesson). Set as soon as
   * the entry is created so the SAME record accumulates learning across every
   * ward round instead of being duplicated.
   */
  linkedRecordId?: string;
  /** Which module `linkedRecordId` lives in. */
  linkedModule?: ModuleType;
  /** Structured clinical reasoning (only for type 'reasoning'). */
  reasoning?: ClinicalReasoning;
}

/** Structured clinical reasoning — for learning and reflection, not diagnosis. */
export interface ClinicalReasoning {
  considered?: string;
  relevantInfo?: string;
  understood?: string;
  confused?: string;
  investigateFurther?: string;
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
  /** Denormalised for fast filtering/among archived stages. */
  level?: string;
  courseId?: string;
}

/**
 * Metadata shared by every clinical-learning record (Phase 2).
 * All optional so records created before this existed remain valid.
 */
export interface LearningMeta {
  academic?: AcademicLink;
  tags?: string[];
  favorite?: boolean;
  /** Free-text personal learning attached to any knowledge record. */
  personalNotes?: string;
  /** Soft delete — hidden from lists but recoverable. */
  archived?: boolean;
}

/** A single entry in the user's learning activity history. */
export interface ActivityEntry extends BaseRecord {
  action: 'created' | 'updated' | 'answered' | 'reviewed' | 'favorited' | 'deleted';
  module: ModuleType;
  recordId: string;
  label: string;
  academic?: AcademicLink;
}
