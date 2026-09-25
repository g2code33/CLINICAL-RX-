import type { KVItem, ModuleType, StorageAdapter } from '../types';

// Browser/web storage adapter. Persists all records as JSON under a single
// localStorage key. Used when running on Vercel (no Electron main process).
// Suitable for the web experience; desktop uses SQLite via IPC.
//
// PROFILE DURABILITY GUARANTEE
// ---------------------------
// The storage key is STABLE (`clinical-rx:v1`) across ALL app updates —
// service-worker cache bumps (clinical-rx-v9, v10, …) NEVER rename or wipe
// this bucket.  For extra safety, every successful write to the `profile`
// or `settings` module also rotates a small rolling backup under a separate
// key, so a corrupt primary record can be recovered at boot instead of the
// user being silently dropped back to Onboarding.
export class LocalStorageAdapter implements StorageAdapter {
  isElectron = false;
  // DO NOT CHANGE without writing a forward migration. Renaming this is how
  // you accidentally erase every user's local profile on update.
  private readonly key = 'clinical-rx:v1';
  private readonly backupKey = 'clinical-rx:profile-backup:v1';
  private items: KVItem[];

  constructor() {
    this.items = this.load();
  }

  private load(): KVItem[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Primary bucket corrupt — keep whatever we have (it will be saved
      // cleanly on the next put) and surface the empty list so init can
      // fall back to the profile backup rather than declaring no profile.
      return [];
    }
  }

  private save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.items));
    } catch {
      /* storage full — never crash a save; data stays in this.items */
    }
  }

  // ---- Rolling profile/settings backup ---------------------------------
  // Keep the last 3 snapshots of profile + settings. Small (a few KB), and
  // enough to recover from anything short of the user wiping their browser.
  private static readonly BACKED_UP_MODULES: ModuleType[] = ['profile', 'settings'];

  private rotateBackup() {
    try {
      const keep: Array<{ module: ModuleType; id: string; data: string; savedAt: number; createdAt: number; updatedAt: number }> = [];
      for (const m of LocalStorageAdapter.BACKED_UP_MODULES) {
        for (const it of this.items.filter((i) => i.module === m)) {
          keep.push({ module: m as ModuleType, id: it.id, data: it.data, createdAt: it.createdAt, updatedAt: it.updatedAt, savedAt: Date.now() });
        }
      }
      if (!keep.length) return;
      const existingRaw = localStorage.getItem(this.backupKey);
      const existing: any[] = existingRaw ? (() => { try { const p = JSON.parse(existingRaw); return Array.isArray(p) ? p : []; } catch { return []; } })() : [];
      const merged = [...keep, ...existing];
      // Keep the most recent 3 snapshots per module.
      const trimmed: any[] = [];
      for (const m of LocalStorageAdapter.BACKED_UP_MODULES) {
        trimmed.push(...merged.filter((x) => x.module === m).slice(0, 3));
      }
      localStorage.setItem(this.backupKey, JSON.stringify(trimmed));
    } catch {
      /* backup is best-effort */
    }
  }

  /**
   * Recover the most recent profile/settings backup. Used by the data store
   * when the primary bucket has no parseable profile — returns null if there
   * is nothing to recover, so the user only sees Onboarding as a true last
   * resort.
   */
  recoverFromBackup(): { profile: any | null; settings: any | null } {
    try {
      const raw = localStorage.getItem(this.backupKey);
      if (!raw) return { profile: null, settings: null };
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return { profile: null, settings: null };
      const parse = (items: any[]) => {
        for (const it of items) {
          try {
            const p = JSON.parse(it.data);
            if (p && typeof p === 'object') return p;
          } catch { /* try older */ }
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

  async platform() {
    return typeof navigator !== 'undefined' && /win/i.test(navigator.platform) ? 'win32' : 'linux';
  }

  async list(module: ModuleType): Promise<KVItem[]> {
    return this.items.filter((i) => i.module === module);
  }

  async get(module: ModuleType, id: string): Promise<any | null> {
    const item = this.items.find((i) => i.module === module && i.id === id);
    if (!item) return null;
    try {
      return JSON.parse(item.data);
    } catch {
      return null;
    }
  }

  async put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number): Promise<void> {
    const idx = this.items.findIndex((i) => i.module === module && i.id === id);
    const json = JSON.stringify(data ?? {});
    if (idx >= 0) {
      this.items[idx] = { ...this.items[idx], data: json, updatedAt };
    } else {
      this.items.push({ id, module, data: json, createdAt, updatedAt });
    }
    this.save();
    if (LocalStorageAdapter.BACKED_UP_MODULES.includes(module)) {
      this.rotateBackup();
    }
  }

  async remove(module: ModuleType, id: string): Promise<void> {
    this.items = this.items.filter((i) => !(i.module === module && i.id === id));
    this.save();
    // When profile or settings are intentionally removed (e.g. "Clear all
    // data"), also drop the backup so recovery doesn't bring stale data back
    // — the user explicitly asked for a clean slate.
    if (LocalStorageAdapter.BACKED_UP_MODULES.includes(module)) {
      try {
        const raw = localStorage.getItem(this.backupKey);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) { localStorage.removeItem(this.backupKey); return; }
        const kept = arr.filter((x: any) => !(x.module === module && x.id === id));
        if (kept.length) localStorage.setItem(this.backupKey, JSON.stringify(kept));
        else localStorage.removeItem(this.backupKey);
      } catch {
        localStorage.removeItem(this.backupKey);
      }
    }
  }
}
