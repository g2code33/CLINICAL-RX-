import { create } from 'zustand';

/**
 * 🩺 HEALTH API HISTORY & FAVORITES STORE
 *
 * Every lookup from the My Health APIs workbench is saved here automatically
 * (offline-first, localStorage only — NOT synced to the cloud, because these
 * are just cached API responses for study reference). Students can:
 *
 *   • Browse history offline (results are here even with no network)
 *   • Star items as favourites
 *   • Add a personal label (title) and free-text tags for study grouping
 *   • Add personal notes
 *   • Delete individual entries or clear history
 *
 * Records are lightweight: the raw response JSON is kept so any future
 * viewer can re-render the same pretty card without re-calling the API.
 */

export type HealthApiSource = 'openfda' | 'rxnav' | 'umls' | 'webmd';
export type HealthApiKind =
  | 'openfda-label'
  | 'openfda-ae'
  | 'openfda-recall'
  | 'rxnav-ddi'
  | 'rxnav-findrxcui'
  | 'umls'
  | 'webmd-link';

export interface HealthApiEntry {
  id: string;
  createdAt: number;
  updatedAt: number;
  source: HealthApiSource;
  kind: HealthApiKind;
  /** What the user typed / the query parameters. */
  query: Record<string, any>;
  /** Short human title shown in history list (auto or user-labeled). */
  title: string;
  /** The API URL that was called (for "open raw" / retry). */
  url?: string;
  /** Raw response JSON (or link-out metadata for webmd). */
  data: any;
  /** True if the user starred this. */
  favorite: boolean;
  /** User tags, e.g. ["cardio", "exam-3", "ward-medicine"]. */
  tags: string[];
  /** Free-text study note the user added to this lookup. */
  note?: string;
  /** Any error string — failed lookups are kept too so the user can retry. */
  error?: string;
}

interface HealthApiState {
  entries: HealthApiEntry[];
  loaded: boolean;
  _init: () => void;
  _persist: () => void;
  addEntry: (e: Omit<HealthApiEntry, 'id' | 'createdAt' | 'updatedAt' | 'favorite' | 'tags' | 'note'> & Partial<Pick<HealthApiEntry, 'favorite' | 'tags' | 'note'>>) => HealthApiEntry;
  updateEntry: (id: string, patch: Partial<HealthApiEntry>) => void;
  toggleFavorite: (id: string) => void;
  removeEntry: (id: string) => void;
  clearHistory: () => void;
  /** Quick search filter across title/query/tags for the sidebar. */
  filtered: (opts: { scope: 'all' | 'favorites' | HealthApiSource; search?: string }) => HealthApiEntry[];
}

const KEY = 'clinical-rx:health-api-history:v1';
const MAX_ENTRIES = 500; // safety cap so localStorage doesn't bloat

function load(): HealthApiEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: HealthApiEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES))); } catch { /* ignore quota */ }
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'hap-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function kindTitle(kind: HealthApiKind, query: Record<string, any>): string {
  const q = query.query || query.drug || query.term || query.name || query.drugs?.join(' + ') || Object.values(query)[0] || '';
  const labels: Record<HealthApiKind, string> = {
    'openfda-label': '💊 Label',
    'openfda-ae': '⚠️ Adverse reactions',
    'openfda-recall': '🚨 Recall',
    'rxnav-ddi': '🔗 Interactions',
    'rxnav-findrxcui': '🔗 RxCUI lookup',
    'umls': '📖 UMLS search',
    'webmd-link': '🌐 WebMD link',
  };
  return `${labels[kind]}${q ? ' — ' + String(q).slice(0, 60) : ''}`;
}

export const useHealthApiStore = create<HealthApiState>((set, get) => ({
  entries: [],
  loaded: false,

  _init: () => {
    if (get().loaded) return;
    set({ entries: load().sort((a, b) => b.createdAt - a.createdAt), loaded: true });
  },

  _persist: () => {
    save(get().entries);
  },

  addEntry: (e) => {
    const now = Date.now();
    const autoTitle = e.title || kindTitle(e.kind, e.query);
    const entry: HealthApiEntry = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      favorite: e.favorite ?? false,
      tags: e.tags ?? [],
      note: e.note ?? '',
      ...e,
      title: autoTitle,
    };
    set((s) => {
      const next = [entry, ...s.entries].slice(0, MAX_ENTRIES);
      save(next);
      return { entries: next };
    });
    return entry;
  },

  updateEntry: (id, patch) => {
    set((s) => {
      const next = s.entries.map((e) => e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e);
      save(next);
      return { entries: next };
    });
  },

  toggleFavorite: (id) => {
    set((s) => {
      const next = s.entries.map((e) => e.id === id ? { ...e, favorite: !e.favorite, updatedAt: Date.now() } : e);
      save(next);
      return { entries: next };
    });
  },

  removeEntry: (id) => {
    set((s) => {
      const next = s.entries.filter((e) => e.id !== id);
      save(next);
      return { entries: next };
    });
  },

  clearHistory: () => {
    set({ entries: [] });
    save([]);
  },

  filtered: ({ scope, search }) => {
    const q = (search || '').trim().toLowerCase();
    return get().entries.filter((e) => {
      if (scope === 'favorites' && !e.favorite) return false;
      if (scope !== 'all' && scope !== 'favorites' && e.source !== scope) return false;
      if (!q) return true;
      if (e.title.toLowerCase().includes(q)) return true;
      if (e.note?.toLowerCase().includes(q)) return true;
      if (e.tags.some((t) => t.toLowerCase().includes(q))) return true;
      try {
        if (JSON.stringify(e.query).toLowerCase().includes(q)) return true;
      } catch { /* ignore */ }
      return false;
    });
  },
}));

// Auto-init on first import
if (typeof window !== 'undefined') {
  useHealthApiStore.getState()._init();
}
