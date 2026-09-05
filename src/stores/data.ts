import { create } from 'zustand';
import type {
  AcademicPeriod,
  AcademicStage,
  Achievement,
  ActivityEntry,
  BaseRecord,
  Certification,
  ClinicalExperience,
  Course,
  Goal,
  LeadershipRole,
  Project,
  ResearchItem,
  Skill,
  Bundle,
  ChatSession,
  ClinicalDay,
  Disease,
  Investigation,
  Lesson,
  Medicine,
  ModuleType,
  Profile,
  Question,
  Reminder,
  RevisionItem,
  SavedQuiz,
  Settings,
  StorageAdapter,
  WardAnalysis,
  WardEntry,
  WardRound,
} from '../types';

/** One item in the Recycle Bin — wraps the original record with metadata. */
export interface TrashItem {
  /** Synthetic id for the trash entry itself (not the record's original id). */
  trashId: string;
  module: ModuleType;
  record: BaseRecord & Record<string, any>;
  deletedAt: number;
  /** Snapshot of the record's title/label at delete time, so we don't have to dig later. */
  label: string;
}
import { LocalStorageAdapter } from '../db/localStorageAdapter';
import { ElectronAdapter } from '../db/electronAdapter';
import { hasElectronBridge } from '../db/adapter';
import { enqueue, backendConfigured, addTombstone } from '../services/syncEngine';

export interface DataStore {
  ready: boolean;
  adapter: StorageAdapter;
  platform: string;
  profile: Profile | null;
  settings: Settings | null;
  days: ClinicalDay[];
  diseases: Disease[];
  medicines: Medicine[];
  investigations: Investigation[];
  questions: Question[];
  lessons: Lesson[];
  revisions: RevisionItem[];
  bundles: Bundle[];
  chats: ChatSession[];
  quizzes: SavedQuiz[];
  reminders: Reminder[];
  wardRounds: WardRound[];
  wardEntries: WardEntry[];
  wardAnalyses: WardAnalysis[];
  academicStages: AcademicStage[];
  academicPeriods: AcademicPeriod[];
  courses: Course[];
  activities: ActivityEntry[];
  // --- Phase 6: professional journey ---
  clinicalExperiences: ClinicalExperience[];
  skills: Skill[];
  achievements: Achievement[];
  certifications: Certification[];
  projects: Project[];
  research: ResearchItem[];
  leadership: LeadershipRole[];
  goals: Goal[];
  status: string;
  removed: TrashItem[];

  init: () => Promise<void>;
  platformName: () => Promise<string>;
  getProfile: () => Promise<Profile | null>;
  saveProfile: (p: Profile) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  undoRemoved: () => Promise<number>;
  restoreFromTrash: (trashId: string) => Promise<boolean>;
  purgeFromTrash: (trashId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;

  all: (module: ModuleType) => Array<BaseRecord & Record<string, any>>;
  getById: (module: ModuleType, id: string) => any | null;
  save: <T extends BaseRecord>(module: ModuleType, record: T, opts?: { fromSync?: boolean }) => Promise<void>;
  remove: (module: ModuleType, id: string, opts?: { fromSync?: boolean }) => Promise<void>;

  setStatus: (s: string) => void;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function sortByUpdated<T extends { updatedAt: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---- Recycle Bin persistence (separate from the main data bucket so deleted
// items survive reinstalls of the main schema and never accidentally come back)
const TRASH_KEY = 'clinical-rx:trash:v1';

function loadTrash(): TrashItem[] {
  try {
    const raw = localStorage.getItem(TRASH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTrash(items: TrashItem[]) {
  try { localStorage.setItem(TRASH_KEY, JSON.stringify(items)); } catch { /* storage full — ignore */ }
}

/** Best-effort human label for a record, used in the recycle bin list. */
function labelFor(module: ModuleType, rec: Record<string, any>): string {
  if (!rec) return '(unknown item)';
  if (typeof rec.title === 'string' && rec.title.trim()) return rec.title;
  if (typeof rec.name === 'string' && rec.name.trim()) return rec.name;
  if (typeof rec.topic === 'string' && rec.topic.trim()) return rec.topic;
  if (typeof rec.text === 'string' && rec.text.trim()) return rec.text.slice(0, 80);
  if (typeof rec.content === 'string' && rec.content.trim()) return rec.content.slice(0, 80);
  if (typeof rec.ward === 'string' && rec.ward.trim()) {
    const d = rec.date ? ` · ${rec.date}` : '';
    return `${rec.ward}${d}`;
  }
  if (typeof rec.date === 'string') return `${module} · ${rec.date}`;
  if (typeof rec.organization === 'string') return `${rec.position || ''} @ ${rec.organization}`.trim();
  return `${module} · ${(rec.id || '').slice(0, 8)}`;
}

// Maps a module to its array key on the store. Most are simply `module + 's'`,
// but irregular plurals (wardEntry -> wardEntries) must be explicit, otherwise
// saves would silently write to a non-existent `wardEntrys` key.
/**
 * Resolve the current academic context straight from state.
 * Computed inline (rather than importing services/academic) because that
 * module imports this store — this keeps the dependency one-directional.
 */
function currentAcademicStamp(state: DataStore): Record<string, string> | null {
  const profile = state.profile;
  const stage =
    state.academicStages.find((s) => s.status === 'current') ??
    state.academicStages.find((s) => s.id === profile?.currentStageId) ??
    null;
  if (!stage && !profile?.academicYear) return null;
  const link: Record<string, string> = {};
  if (stage?.id) link.stageId = stage.id;
  if (stage?.level) link.level = stage.level;
  const year = stage?.academicYear ?? profile?.academicYear;
  if (year) link.academicYear = year;
  const periodId = profile?.currentPeriodId;
  if (periodId && state.academicPeriods.some((p) => p.id === periodId)) link.periodId = periodId;
  return Object.keys(link).length ? link : null;
}

/** Modules that carry academic context so data links across the journey. */
const STAMPED_MODULES: ModuleType[] = [
  'day', 'disease', 'medicine', 'investigation', 'question', 'lesson',
  'revision', 'bundle', 'quiz', 'wardRound',
  // Phase 6: professional records are stamped with the level they happened in,
  // so promotion can never rewrite their history.
  'clinicalExperience', 'skill', 'achievement', 'project', 'research',
  'leadership', 'goal',
];

const LIST_KEY: Partial<Record<ModuleType, keyof DataStore>> = {
  wardRound: 'wardRounds',
  wardEntry: 'wardEntries',
  wardAnalysis: 'wardAnalyses',
  academicStage: 'academicStages',
  academicPeriod: 'academicPeriods',
  course: 'courses',
  activity: 'activities',
  // 'quiz' + 's' = 'quizs', which is not a key on the store — without this the
  // quizzes array silently never updated after a save.
  quiz: 'quizzes',
  // Uncountable nouns: `research` + 's' and `leadership` + 's' are not the
  // store keys, so without these the arrays would silently never update.
  research: 'research',
  leadership: 'leadership',
};

function listKeyFor(module: ModuleType, state: Record<string, unknown>): keyof DataStore {
  const explicit = LIST_KEY[module];
  if (explicit) return explicit;
  const plural = module + 's';
  return (plural in state ? plural : module) as keyof DataStore;
}

export const useData = create<DataStore>((set, get) => ({
  ready: false,
  adapter: hasElectronBridge() ? new ElectronAdapter() : new LocalStorageAdapter(),
  platform: 'web',
  profile: null,
  settings: null,
  days: [],
  diseases: [],
  medicines: [],
  investigations: [],
  questions: [],
  lessons: [],
  revisions: [],
  bundles: [],
  chats: [],
  quizzes: [],
  reminders: [],
  wardRounds: [],
  wardEntries: [],
  wardAnalyses: [],
  academicStages: [],
  academicPeriods: [],
  courses: [],
  activities: [],
  clinicalExperiences: [],
  skills: [],
  achievements: [],
  certifications: [],
  projects: [],
  research: [],
  leadership: [],
  goals: [],
  removed: loadTrash(),
  status: 'Initializing…',

  init: async () => {
    const adapter = get().adapter;
    set({ status: 'Loading local data…' });
    try {
      const platform = await adapter.platform();
      const [profiles, settingsList, days, diseases, medicines, investigations, questions, lessons, revisions, bundles, chats, quizzes, reminders, wardRounds, wardEntries, wardAnalyses, academicStages, academicPeriods, courses, activities, clinicalExperiences, skills, achievements, certifications, projects, research, leadership, goals] =
        await Promise.all([
          adapter.list('profile'),
          adapter.list('settings'),
          adapter.list('day'),
          adapter.list('disease'),
          adapter.list('medicine'),
          adapter.list('investigation'),
          adapter.list('question'),
          adapter.list('lesson'),
          adapter.list('revision'),
          adapter.list('bundle'),
          adapter.list('chat'),
          adapter.list('quiz'),
          adapter.list('reminder'),
          adapter.list('wardRound'),
          adapter.list('wardEntry'),
          adapter.list('wardAnalysis'),
          adapter.list('academicStage'),
          adapter.list('academicPeriod'),
          adapter.list('course'),
          adapter.list('activity'),
          adapter.list('clinicalExperience'),
          adapter.list('skill'),
          adapter.list('achievement'),
          adapter.list('certification'),
          adapter.list('project'),
          adapter.list('research'),
          adapter.list('leadership'),
          adapter.list('goal'),
        ]);
      // Defensive parse: skip any corrupt record instead of throwing, so the
      // app can never be locked on the splash screen by bad stored data.
      const parse = (items: any[]) =>
        items
          .map((i) => {
            try { return JSON.parse(i.data); } catch { return null; }
          })
          .filter(Boolean);
      const profile = profiles.length ? parse(profiles)[0] : null;
      const settings = settingsList.length ? parse(settingsList)[0] : null;
      set({
        platform,
        profile,
        settings,
        days: sortByUpdated(parse(days)),
        diseases: sortByUpdated(parse(diseases)),
        medicines: sortByUpdated(parse(medicines)),
        investigations: sortByUpdated(parse(investigations)),
        questions: sortByUpdated(parse(questions)),
        lessons: sortByUpdated(parse(lessons)),
        revisions: sortByUpdated(parse(revisions)),
        bundles: sortByUpdated(parse(bundles)),
        chats: sortByUpdated(parse(chats)),
        quizzes: sortByUpdated(parse(quizzes)),
        reminders: sortByUpdated(parse(reminders)),
        wardRounds: sortByUpdated(parse(wardRounds)),
        wardEntries: sortByUpdated(parse(wardEntries)),
        wardAnalyses: sortByUpdated(parse(wardAnalyses)),
        academicStages: sortByUpdated(parse(academicStages)),
        academicPeriods: sortByUpdated(parse(academicPeriods)),
        courses: sortByUpdated(parse(courses)),
        activities: sortByUpdated(parse(activities)),
        clinicalExperiences: sortByUpdated(parse(clinicalExperiences)),
        skills: sortByUpdated(parse(skills)),
        achievements: sortByUpdated(parse(achievements)),
        certifications: sortByUpdated(parse(certifications)),
        projects: sortByUpdated(parse(projects)),
        research: sortByUpdated(parse(research)),
        leadership: sortByUpdated(parse(leadership)),
        goals: sortByUpdated(parse(goals)),
        ready: true,
        status: 'Ready · ' + (hasElectronBridge() ? 'SQLite (offline)' : 'Web storage'),
      });
    } catch (e: any) {
      // Never hard-lock the app: surface the error but still boot.
      console.error('[clinical-rx] init failed:', e);
      set({
        ready: true,
        status: '⚠️ Load error — some data may be missing',
      });
    }
  },

  platformName: async () => {
    const p = await get().adapter.platform();
    set({ platform: p });
    return p;
  },

  getProfile: async () => get().profile,

  saveProfile: async (p) => {
    const adapter = get().adapter;
    await adapter.put('profile', p.id, p, p.createdAt, p.updatedAt);
    set({ profile: p });
  },

  saveSettings: async (s) => {
    const adapter = get().adapter;
    await adapter.put('settings', s.id, s, s.createdAt, s.updatedAt);
    set({ settings: s });
  },

  all: (module) => {
    const profile = get().profile;
    const settings = get().settings;
    const map: Record<ModuleType, BaseRecord[]> = {
      profile: profile ? [profile] : [],
      settings: settings ? [settings] : [],
      day: get().days,
      disease: get().diseases,
      medicine: get().medicines,
      investigation: get().investigations,
      question: get().questions,
      lesson: get().lessons,
      revision: get().revisions,
      bundle: get().bundles,
      chat: get().chats,
      quiz: get().quizzes,
      reminder: get().reminders,
      wardRound: get().wardRounds,
      wardEntry: get().wardEntries,
      wardAnalysis: get().wardAnalyses,
      clinicalExperience: get().clinicalExperiences,
      skill: get().skills,
      achievement: get().achievements,
      certification: get().certifications,
      project: get().projects,
      research: get().research,
      leadership: get().leadership,
      goal: get().goals,
      academicStage: get().academicStages,
      academicPeriod: get().academicPeriods,
      course: get().courses,
      activity: get().activities,
    };
    return map[module] as Array<BaseRecord & Record<string, any>>;
  },

  getById: (module, id) => {
    return get().all(module).find((r) => r.id === id) ?? null;
  },

  save: async (module, record, opts) => {
    const adapter = get().adapter;
    const fromSync = opts?.fromSync === true;
    const now = Date.now();
    // Records applied from a sync must keep the server's updatedAt and must
    // NOT be re-enqueued, otherwise every pull pushes everything back up and
    // the sync never converges.
    let rec: any = fromSync ? { ...record } : { ...record, updatedAt: now };
    // ONE LINKED DATASET: stamp the academic context (level / year / semester)
    // onto every learning record as it is written, from wherever it was
    // created — UI, quick add, ward rounds, importers or automation. Existing
    // stamps are never overwritten, so history stays true after promotion.
    if (!fromSync && STAMPED_MODULES.includes(module) && !rec.academic?.stageId) {
      const link = currentAcademicStamp(get());
      if (link) rec = { ...rec, academic: { ...link, ...(rec.academic ?? {}) } };
    }
    await adapter.put(module, rec.id, rec, rec.createdAt, rec.updatedAt);
    if (!fromSync && backendConfigured()) {
      enqueue({ op: 'upsert', module, id: rec.id, data: rec, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
      // Nudge the scheduler; it debounces a burst of edits into one sync.
      // Imported lazily so the store never depends on the scheduler at boot.
      import('../services/syncScheduler').then((m) => m.notifyLocalChange()).catch(() => {});
    }
    set((s) => {
      const listKey = listKeyFor(module, s as unknown as Record<string, unknown>);
      const existing = (s[listKey] as BaseRecord[]) || [];
      const next = existing.some((r) => r.id === rec.id)
        ? existing.map((r) => (r.id === rec.id ? rec : r))
        : [...existing, rec];
      return { [listKey]: sortByUpdated(next as any), status: '✓ Saved locally' } as any;
    });
    // Fire-and-forget: when a clinical DAY is saved/updated —
    // 1) sync its conditions/medicines/investigations/lessons into the
    //    respective compartments, and
    // 2) try today's auto bundle (and the pending-AI queue).
    // Keep the AI's app-wide memory fresh after any write.
    import('../services/aiTools').then((m) => m.invalidateAppContext()).catch(() => {});
    if (!fromSync && module === 'day') {
      import('../services/daySync').then((m) => m.syncDayToCompartments(rec.id)).catch(() => {});
      import('../services/autoBundle').then((m) => m.processAiWhenOnline()).catch(() => {});
    }
    // A completed ward round feeds the automatic daily/weekly bundlers the same
    // way a clinical day does.
    if (!fromSync && module === 'wardRound' && (rec as any).status === 'completed') {
      import('../services/autoBundle').then((m) => m.processAiWhenOnline()).catch(() => {});
    }
  },

  remove: async (module, id, opts) => {
    const adapter = get().adapter;
    const fromSync = opts?.fromSync === true;
    // Keep the record for undo / recycle bin (unless this came from a sync apply).
    let snapshot: any = null;
    if (!fromSync) snapshot = get().all(module).find((r) => r.id === id) ?? null;
    await adapter.remove(module, id);
    if (!fromSync && backendConfigured()) {
      enqueue({ op: 'delete', module, id });
      import('../services/syncScheduler').then((m) => m.notifyLocalChange()).catch(() => {});
    }
    // Tombstone every local delete, even when signed out — the user may sign
    // in later, and a pull must not resurrect what they deleted offline (§24).
    if (!fromSync) addTombstone(module, id);
    set((s) => {
      const listKey = listKeyFor(module, s as unknown as Record<string, unknown>);
      const existing = (s[listKey] as BaseRecord[]) || [];
      let nextRemoved = s.removed;
      if (snapshot) {
        const trashItem: TrashItem = {
          trashId: 'trash_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          module,
          record: snapshot,
          deletedAt: Date.now(),
          label: labelFor(module, snapshot),
        };
        nextRemoved = [trashItem, ...s.removed];
        saveTrash(nextRemoved);
      }
      return { [listKey]: existing.filter((r) => r.id !== id), removed: nextRemoved, status: fromSync ? '✓ Synced' : '✓ Deleted' } as any;
    });
  },

  undoRemoved: async () => {
    const st = get();
    if (!st.removed.length) return 0;
    const last = st.removed[0];
    const rec = last.record;
    if (rec && rec.id) {
      await st.save(last.module, rec, { fromSync: true });
    }
    const next = st.removed.slice(1);
    saveTrash(next);
    set({ removed: next, status: '↩ Undid deletion' });
    return 1;
  },

  restoreFromTrash: async (trashId) => {
    const st = get();
    const idx = st.removed.findIndex((t) => t.trashId === trashId);
    if (idx < 0) return false;
    const item = st.removed[idx];
    // Skip if a record with the same id already exists (user recreated it).
    if (st.getById(item.module, item.record.id)) {
      // Just remove from trash; data is already present.
      const next = st.removed.filter((t) => t.trashId !== trashId);
      saveTrash(next);
      set({ removed: next, status: 'Item already exists — removed from bin' });
      return true;
    }
    await st.save(item.module, item.record, { fromSync: true });
    const next = st.removed.filter((t) => t.trashId !== trashId);
    saveTrash(next);
    set({ removed: next, status: `↩ Restored "${item.label}"` });
    return true;
  },

  purgeFromTrash: async (trashId) => {
    set((s) => {
      const next = s.removed.filter((t) => t.trashId !== trashId);
      saveTrash(next);
      return { removed: next, status: 'Permanently deleted' };
    });
    // Also remove tombstone so a future sync of the same id is clean — but for
    // now we leave the tombstone in place (safer: prevents cloud resurrect).
  },

  emptyTrash: async () => {
    saveTrash([]);
    set({ removed: [], status: '🗑 Recycle bin emptied' });
  },

  setStatus: (s) => set({ status: s }),
}));

export { uid };
