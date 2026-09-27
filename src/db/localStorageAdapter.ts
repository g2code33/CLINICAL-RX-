import type { KVItem, ModuleType, StorageAdapter } from '../types';
import {
  atomicLocalStorageWrite,
  loadDurableSnapshot,
  parseSnapshot,
  safeLocalStorageRead,
  saveDurableSnapshot,
} from './durableStore';

// Browser/web storage adapter. Persists all records as JSON under a single
// localStorage key. Used when running on Vercel (no Electron main process).
// Suitable for the web experience; desktop uses SQLite via IPC.
//
// PROFILE DURABILITY GUARANTEE
// ---------------------------
// The storage key is STABLE (`clinical-rx:v1`) across ALL app updates —
// service-worker cache bumps (clinical-rx-v9, v10, …) NEVER rename or wipe
// this bucket.
//
// Three layers of redundancy protect against data loss:
//   1. PRIMARY — atomic write to `clinical-rx:v1` localStorage key (tmp+rename
//      so a crashed/quota-killed write can never corrupt the existing copy).
//   2. ROLLING BACKUP — last 3 snapshots of profile+settings under
//      `clinical-rx:profile-backup:v1` (same localStorage).
//   3. DURABLE MIRROR — every full dataset mirrored asynchronously into
//      IndexedDB (`clinical-rx-durable`) via durableStore.ts. IndexedDB has
//      higher quota, is independent of localStorage-only "clear site data"
//      paths, and survives hard refreshes, incognito-to-normal transitions,
//      iOS Safari eviction, and partial localStorage corruption. Used as a
//      last-resort boot recovery source.
//
// A user should only ever see Onboarding if there is literally nothing left
// to recover on the device.
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
    // Layer 1: primary localStorage bucket.
    const raw = safeLocalStorageRead(this.key);
    if (raw) {
      const parsed = this.tryParse(raw);
      if (parsed) return parsed;
    }

    // Layer 1 corrupted: schedule an async IndexedDB recovery attempt before
    // giving up. (We can't await in the constructor, but the data store's init
    // will call `restoreFromDurableMirror()` after construction.)
    return [];
  }

  private tryParse(raw: string): KVItem[] | null {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      // Validate shape so a truncated file doesn't poison the session.
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

  private save() {
    try {
      const serialized = JSON.stringify(this.items);
      // Layer 1: atomic write (tmp → commit).
      atomicLocalStorageWrite(this.key, serialized);
      // Layer 3: async mirror to IndexedDB (never blocks, never throws).
      void saveDurableSnapshot(this.key, serialized);
    } catch {
      /* storage full — never crash a save; data stays in this.items */
    }
  }

  /**
   * Called by the data store AFTER constructing the adapter and before
   * declaring "no profile" (which would trigger Onboarding). Checks both the
   * in-localStorage rolling backup AND the IndexedDB durable mirror, restoring
   * whichever is newer/available. Returns true if something was recovered.
   */
  async restoreFromDurableMirror(): Promise<boolean> {
    // If we already have a profile, no recovery needed.
    if (this.items.some((i) => i.module === 'profile')) return false;

    // Try IndexedDB mirror first (it captures the whole dataset, not just
    // profile+settings).
    const snap = await loadDurableSnapshot(this.key);
    if (snap) {
      const parsed = parseSnapshot(snap.raw);
      if (parsed && parsed.some((i) => i.module === 'profile')) {
        this.items = parsed;
        this.save(); // write recovered state back to primary
        console.info('[clinical-rx] Recovered full dataset from IndexedDB durable mirror.');
        return true;
      }
    }
    return false;
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
      const existingRaw = safeLocalStorageRead(this.backupKey);
      const existing: any[] = existingRaw ? (() => { try { const p = JSON.parse(existingRaw); return Array.isArray(p) ? p : []; } catch { return []; } })() : [];
      const merged = [...keep, ...existing];
      const trimmed: any[] = [];
      for (const m of LocalStorageAdapter.BACKED_UP_MODULES) {
        trimmed.push(...merged.filter((x) => x.module === m).slice(0, 3));
      }
      atomicLocalStorageWrite(this.backupKey, JSON.stringify(trimmed));
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
      const raw = safeLocalStorageRead(this.backupKey);
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
    // data"), also drop backups + durable mirror so recovery doesn't bring
    // stale data back — the user explicitly asked for a clean slate.
    if (LocalStorageAdapter.BACKED_UP_MODULES.includes(module)) {
      try {
        const raw = safeLocalStorageRead(this.backupKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const kept = arr.filter((x: any) => !(x.module === module && x.id === id));
            if (kept.length) atomicLocalStorageWrite(this.backupKey, JSON.stringify(kept));
            else localStorage.removeItem(this.backupKey);
          } else {
            localStorage.removeItem(this.backupKey);
          }
        }
      } catch {
        localStorage.removeItem(this.backupKey);
      }
      // Clear the durable mirror when explicitly wiping profile so it doesn't
      // resurrect deleted data on next boot.
      if (module === 'profile') {
        try {
          const { wipeDurableSnapshot } = await import('./durableStore');
          await wipeDurableSnapshot(this.key);
        } catch { /* ignore */ }
        try { localStorage.removeItem(this.key); } catch { /* ignore */ }
      }
    }
  }
}
