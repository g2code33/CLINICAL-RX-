import type { KVItem, ModuleType, StorageAdapter } from '../types';
import {
  activeWebStorage,
  detectStorageBackend,
  indexedDbAvailable,
  type StorageBackendInfo,
} from './storageDetect';

// Browser/web storage adapter. Persists all records as JSON under a single
// storage key. Used when running on Vercel, Android WebView, or the desktop
// dev server (when there is no Electron bridge). Desktop production uses
// SQLite via the Electron adapter.
//
// STORAGE DURABILITY HIERARCHY
// ----------------------------
//   1. PRIMARY  — the chosen storage backend (localStorage → sessionStorage →
//                 in-memory), selected via a live write+read probe at boot.
//                 Writes are atomic (tmp key → verify → commit) so a crashed
//                 or quota-killed save cannot corrupt the existing copy.
//   2. ROLLING BACKUP — last 3 snapshots of profile+settings under a separate
//                 key on the same storage backend.
//   3. DURABLE MIRROR — every successful full-dataset save is mirrored
//                 asynchronously to IndexedDB (if available), which has
//                 higher quota and is independent of localStorage-only
//                 "clear site data" paths. Used as a last-resort boot
//                 recovery source.
//
// If all backends are blocked (e.g. the app is running inside a third-party
// iframe that disables storage), the adapter degrades to in-memory mode and
// surfaces a warning in the status line so the user knows to open the app in
// a top-level tab to get real persistence.
export class LocalStorageAdapter implements StorageAdapter {
  isElectron = false;
  private readonly key = 'clinical-rx:v1';
  private readonly backupKey = 'clinical-rx:profile-backup:v1';
  private backend!: StorageBackendInfo;
  private store: Storage | null = null;
  private useIdb = false;
  private items: KVItem[] = [];
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    this.backend = await detectStorageBackend();
    this.store = activeWebStorage(this.backend);
    this.useIdb = await indexedDbAvailable();
    if (this.backend.backend === 'memory') {
      console.warn('[clinical-rx] ⚠️ Persistent storage is blocked in this context. Data will NOT survive reload. Open the app directly (not in a preview iframe) to save your work.');
    } else if (!this.backend.persistent) {
      console.warn('[clinical-rx] ⚠️', this.backend.reason);
    }
    this.items = this.loadPrimary();
    if (this.items.length === 0 && this.useIdb) {
      // IndexedDB recovery runs after init; see restoreFromDurableMirror().
    }
  }

  /** Wait for the backend probe to finish. Called by the data store before reading. */
  async waitReady(): Promise<void> {
    await this.ready;
  }

  private loadPrimary(): KVItem[] {
    if (!this.store) return [];
    try {
      const raw = this.store.getItem(this.key);
      if (!raw) return [];
      const parsed = this.parseItems(raw);
      return parsed ?? [];
    } catch {
      return [];
    }
  }

  private parseItems(raw: string): KVItem[] | null {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const out: KVItem[] = [];
      for (const it of parsed) {
        if (it && typeof it.module === 'string' && typeof it.id === 'string' && typeof it.data === 'string') {
          out.push({ module: it.module as ModuleType, id: it.id, data: it.data, createdAt: it.createdAt || Date.now(), updatedAt: it.updatedAt || Date.now() });
        }
      }
      return out;
    } catch {
      return null;
    }
  }

  private atomicWrite(k: string, v: string): void {
    if (!this.store) return;
    try {
      const tmp = k + ':tmp';
      this.store.setItem(tmp, v);
      if (this.store.getItem(tmp) !== v) { this.store.removeItem(tmp); return; }
      this.store.setItem(k, v);
      this.store.removeItem(tmp);
    } catch {
      /* quota / disabled — ignore; data stays in this.items */
    }
  }

  private save() {
    try {
      const serialized = JSON.stringify(this.items);
      if (this.store) this.atomicWrite(this.key, serialized);
      if (this.useIdb) {
        import('./durableStore').then(({ saveDurableSnapshot }) => {
          void saveDurableSnapshot(this.key, serialized);
        }).catch(() => {});
      }
    } catch {
      /* storage full — never crash a save */
    }
  }

  async restoreFromDurableMirror(): Promise<boolean> {
    await this.ready;
    if (this.items.some((i) => i.module === 'profile')) return false;
    if (!this.useIdb) return false;
    try {
      const { loadDurableSnapshot, parseSnapshot } = await import('./durableStore');
      const snap = await loadDurableSnapshot(this.key);
      if (!snap) return false;
      const parsed = parseSnapshot(snap.raw);
      if (parsed && parsed.some((i) => i.module === 'profile')) {
        this.items = parsed;
        this.save();
        console.info('[clinical-rx] Recovered full dataset from IndexedDB durable mirror.');
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  private static readonly BACKED_UP_MODULES: ModuleType[] = ['profile', 'settings'];

  private rotateBackup() {
    if (!this.store) return;
    try {
      const keep: Array<{ module: ModuleType; id: string; data: string; savedAt: number; createdAt: number; updatedAt: number }> = [];
      for (const m of LocalStorageAdapter.BACKED_UP_MODULES) {
        for (const it of this.items.filter((i) => i.module === m)) {
          keep.push({ module: m as ModuleType, id: it.id, data: it.data, createdAt: it.createdAt, updatedAt: it.updatedAt, savedAt: Date.now() });
        }
      }
      if (!keep.length) return;
      let existing: any[] = [];
      try { const raw = this.store.getItem(this.backupKey); if (raw) existing = JSON.parse(raw); if (!Array.isArray(existing)) existing = []; } catch { existing = []; }
      const merged = [...keep, ...existing];
      const trimmed: any[] = [];
      for (const m of LocalStorageAdapter.BACKED_UP_MODULES) {
        trimmed.push(...merged.filter((x) => x.module === m).slice(0, 3));
      }
      this.atomicWrite(this.backupKey, JSON.stringify(trimmed));
    } catch { /* best effort */ }
  }

  recoverFromBackup(): { profile: any | null; settings: any | null } {
    if (!this.store) return { profile: null, settings: null };
    try {
      const raw = this.store.getItem(this.backupKey);
      if (!raw) return { profile: null, settings: null };
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return { profile: null, settings: null };
      const parse = (items: any[]) => {
        for (const it of items) {
          try { const p = JSON.parse(it.data); if (p && typeof p === 'object') return p; } catch { /* try older */ }
        }
        return null;
      };
      return {
        profile: parse(arr.filter((x) => x.module === 'profile')),
        settings: parse(arr.filter((x) => x.module === 'settings')),
      };
    } catch {
      return { profile: null, settings: null };
    }
  }

  /** Expose backend info so the UI can warn when persistence is degraded. */
  storageInfo(): StorageBackendInfo {
    return this.backend;
  }

  async platform() {
    return typeof navigator !== 'undefined' && /win/i.test(navigator.platform) ? 'win32' : 'linux';
  }

  async list(module: ModuleType): Promise<KVItem[]> {
    await this.ready;
    return this.items.filter((i) => i.module === module);
  }

  async get(module: ModuleType, id: string): Promise<any | null> {
    await this.ready;
    const item = this.items.find((i) => i.module === module && i.id === id);
    if (!item) return null;
    try { return JSON.parse(item.data); } catch { return null; }
  }

  async put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number): Promise<void> {
    await this.ready;
    const idx = this.items.findIndex((i) => i.module === module && i.id === id);
    const json = JSON.stringify(data ?? {});
    if (idx >= 0) this.items[idx] = { ...this.items[idx], data: json, updatedAt };
    else this.items.push({ id, module, data: json, createdAt, updatedAt });
    this.save();
    if (LocalStorageAdapter.BACKED_UP_MODULES.includes(module)) this.rotateBackup();
  }

  async remove(module: ModuleType, id: string): Promise<void> {
    await this.ready;
    this.items = this.items.filter((i) => !(i.module === module && i.id === id));
    this.save();
    if (LocalStorageAdapter.BACKED_UP_MODULES.includes(module)) {
      try {
        if (this.store) {
          const raw = this.store.getItem(this.backupKey);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              const kept = arr.filter((x: any) => !(x.module === module && x.id === id));
              if (kept.length) this.atomicWrite(this.backupKey, JSON.stringify(kept));
              else this.store.removeItem(this.backupKey);
            } else this.store.removeItem(this.backupKey);
          }
        }
      } catch { if (this.store) this.store.removeItem(this.backupKey); }
      if (module === 'profile' && this.useIdb) {
        try {
          const { wipeDurableSnapshot } = await import('./durableStore');
          await wipeDurableSnapshot(this.key);
        } catch { /* ignore */ }
      }
    }
  }
}
