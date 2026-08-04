import { create } from 'zustand';
import type {
  BaseRecord,
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
  RevisionItem,
  Settings,
  StorageAdapter,
} from '../types';
import { LocalStorageAdapter } from '../db/localStorageAdapter';
import { ElectronAdapter } from '../db/electronAdapter';
import { hasElectronBridge } from '../db/adapter';
import { enqueue, backendConfigured } from '../services/syncEngine';

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
  status: string;

  init: () => Promise<void>;
  platformName: () => Promise<string>;
  getProfile: () => Promise<Profile | null>;
  saveProfile: (p: Profile) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;

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
  status: 'Initializing…',

  init: async () => {
    const adapter = get().adapter;
    set({ status: 'Loading local data…' });
    const platform = await adapter.platform();
    const [profiles, settingsList, days, diseases, medicines, investigations, questions, lessons, revisions, bundles, chats] =
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
      ]);
    const parse = (items: any[]) => items.map((i) => JSON.parse(i.data));
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
      ready: true,
      status: 'Ready · ' + (hasElectronBridge() ? 'SQLite (offline)' : 'Web storage'),
    });
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
    const rec = fromSync ? { ...record } : { ...record, updatedAt: now };
    await adapter.put(module, rec.id, rec, rec.createdAt, rec.updatedAt);
    if (!fromSync && backendConfigured()) enqueue({ op: 'upsert', module, id: rec.id, data: rec, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
    set((s) => {
      const key = module + 's';
      const listKey = (key in s ? key : module) as keyof DataStore;
      const existing = (s[listKey] as BaseRecord[]) || [];
      const next = existing.some((r) => r.id === rec.id)
        ? existing.map((r) => (r.id === rec.id ? rec : r))
        : [...existing, rec];
      return { [listKey]: sortByUpdated(next as any), status: '✓ Saved locally' } as any;
    });
  },

  remove: async (module, id, opts) => {
    const adapter = get().adapter;
    const fromSync = opts?.fromSync === true;
    await adapter.remove(module, id);
    if (!fromSync && backendConfigured()) enqueue({ op: 'delete', module, id });
    set((s) => {
      const listKey = (module + 's' in s ? module + 's' : module) as keyof DataStore;
      const existing = (s[listKey] as BaseRecord[]) || [];
      return { [listKey]: existing.filter((r) => r.id !== id), status: fromSync ? '✓ Synced' : '✓ Deleted' } as any;
    });
  },

  setStatus: (s) => set({ status: s }),
}));

export { uid };
