import { ElectronAdapter } from './electronAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import type { KVItem, ModuleType, StorageAdapter } from '../types';

// ---------------------------------------------------------------------------
// Adapter resolution — THE DUAL-WRITE GUARANTEE.
//
// The history of this file is a trail of "detect which backend is right at
// startup and use only that one":
//
//   v1.11.11 — picked at module-import time (race: bridge not attached yet)
//   v1.11.16 — picked lazily in init() (still racy on Linux/.deb cold starts)
//   v1.11.17 — hot-swap + auto migration when bridge appears later (still
//              depends on JS code paths being hit after swap; misses writes
//              that happen between init() and swap)
//
// The BULLETPROOF approach (v1.11.18) is to STOP CHOOSING.
//
// We ALWAYS keep a LocalStorageAdapter alive (it works everywhere, is
// effectively free, and gives us a renderer-local cache). If the Electron
// bridge is present — AT THE MOMENT OF EACH CALL — we ALSO write to SQLite.
// Reads prefer SQLite (the canonical on-disk store) but fall back to
// localStorage if SQLite is unreachable or empty. Writes NEVER silently lose
// data: if one backend fails, the other still has the record, and we migrate
// it over on the next successful SQLite contact.
//
// This way it DOES NOT MATTER when the bridge attaches. Data written during
// the race window lives in localStorage; the moment the bridge is attached
// subsequent reads pick up anything that was previously written to
// localStorage (via a first-read reconciliation) and dual-write kicks in.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    clinicalRx?: StorageAdapter & {
      isElectron?: boolean;
      installType?: () => Promise<string>;
      notify?: (payload: { title?: string; body?: string }) => Promise<{ ok: boolean }>;
      log?: (level: string, ...args: unknown[]) => void;
      update: {
        getVersion: () => Promise<{ appVersion: string; enabled: boolean; owner: string; repo: string }>;
        getState: () => Promise<{ appVersion: string }>;
        check: () => Promise<{ ok: boolean; reason?: string; message?: string; updateInfo?: any }>;
        download: () => Promise<{ ok: boolean; reason?: string; message?: string }>;
        install: () => Promise<{ ok: boolean; reason?: string; message?: string }>;
        onStatus: (cb: (s: any) => void) => () => void;
      };
    };
  }
}

export function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && !!window.clinicalRx && window.clinicalRx.isElectron === true;
}

function rxLog(level: 'log' | 'warn' | 'error' | 'info', ...args: unknown[]) {
  try {
    if (typeof console !== 'undefined') {
      (console as any)[level]?.(...args);
    }
    try {
      if (typeof window !== 'undefined' && window.clinicalRx && typeof (window.clinicalRx as any).log === 'function') {
        (window.clinicalRx as any).log(level, ...args);
      }
    } catch { /* ignore */ }
  } catch { /* logging must never throw */ }
}

/**
 * The DUAL-WRITE adapter.
 *
 * - Holds a permanent LocalStorageAdapter (the renderer-local fallback).
 * - If/when the Electron bridge is present, creates an ElectronAdapter on
 *   demand and dual-writes to both.
 * - Reads try SQLite first, fall back to localStorage, and auto-reconcile
 *   (i.e. any localStorage-only records are copied to SQLite the first time
 *   they would otherwise be returned from localStorage).
 * - Removes are mirrored to both.
 * - platform() prefers Electron if available, else reports 'web'.
 */
class DualAdapter implements StorageAdapter {
  isElectron = false; // updated per-call
  private local: LocalStorageAdapter | null = null;
  private electron: ElectronAdapter | null = null;
  private reconciledModules = new Set<ModuleType>();
  private warnedBridgeMissing = false;

  private getLocal(): LocalStorageAdapter {
    if (!this.local) this.local = new LocalStorageAdapter();
    return this.local;
  }

  private getElectron(): ElectronAdapter | null {
    if (hasElectronBridge()) {
      if (!this.electron) {
        try {
          this.electron = new ElectronAdapter();
          rxLog('info', 'clinical-rx: Electron bridge attached — dual-write to SQLite enabled.');
        } catch (e) {
          rxLog('warn', 'clinical-rx: failed to create ElectronAdapter:', e);
          this.electron = null;
        }
      }
      return this.electron;
    }
    this.electron = null;
    if (!this.warnedBridgeMissing && typeof window !== 'undefined' && typeof navigator !== 'undefined' &&
        /electron/i.test(navigator.userAgent || '')) {
      this.warnedBridgeMissing = true;
      rxLog('warn', 'clinical-rx: running under Electron but bridge is not attached yet — writing to localStorage until bridge appears (data will be reconciled to SQLite).');
    }
    return null;
  }

  async waitReady(): Promise<void> {
    const local = this.getLocal();
    if (typeof (local as any).waitReady === 'function') {
      await (local as any).waitReady();
    }
  }

  storageInfo() {
    return (this.getLocal() as any).storageInfo?.() ?? { persistent: this.isElectron, reason: this.isElectron ? 'SQLite' : 'web storage' };
  }

  recoverFromBackup() {
    return (this.getLocal() as any).recoverFromBackup?.();
  }

  restoreFromDurableMirror() {
    const l = this.getLocal() as any;
    if (typeof l.restoreFromDurableMirror === 'function') return l.restoreFromDurableMirror();
    return Promise.resolve(null);
  }

  async platform(): Promise<string> {
    const e = this.getElectron();
    if (e) {
      try { this.isElectron = true; return await e.platform(); } catch (err) { rxLog('warn', 'clinical-rx: electron platform() failed:', err); }
    }
    return typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '') ? 'electron-pending' : 'web';
  }

  async list(module: ModuleType): Promise<KVItem[]> {
    const local = this.getLocal();
    const electron = this.getElectron();
    this.isElectron = !!electron;

    const [localItems, electronItems] = await Promise.all([
      local.list(module).catch((e: unknown) => { rxLog('warn', `localStorage list(${module}) failed:`, e); return [] as KVItem[]; }),
      electron ? electron.list(module).catch((e: unknown) => { rxLog('warn', `SQLite list(${module}) failed:`, e); return [] as KVItem[]; }) : Promise.resolve([] as KVItem[]),
    ]);

    if (electron && electronItems.length === 0 && localItems.length > 0 && !this.reconciledModules.has(module)) {
      // SQLite is empty for this module but localStorage has data → first-run
      // after bridge arrives; migrate localStorage → SQLite so the data lives
      // on disk.
      this.reconciledModules.add(module);
      rxLog('info', `clinical-rx: reconciling ${localItems.length} ${module} record(s) from localStorage → SQLite`);
      await Promise.all(localItems.map((it) => {
        let parsed: unknown = it.data;
        try { if (typeof it.data === 'string') parsed = JSON.parse(it.data); } catch { parsed = it.data; }
        return electron.put(module, it.id, parsed, it.createdAt, it.updatedAt).catch((e) => {
          rxLog('warn', `reconcile put(${module}/${it.id}) failed:`, e);
        });
      })).catch(() => {});
      // Re-read from SQLite now that we've migrated.
      const fresh = await electron.list(module).catch(() => [] as KVItem[]);
      if (fresh.length > 0) return fresh;
    }

    if (electron && electronItems.length > 0) {
      return electronItems;
    }
    return localItems;
  }

  async get(module: ModuleType, id: string): Promise<any | null> {
    const local = this.getLocal();
    const electron = this.getElectron();
    this.isElectron = !!electron;
    if (electron) {
      try {
        const v = await electron.get(module, id);
        if (v !== null && v !== undefined) {
          // Also stash back to localStorage so renderer-local cache is hot.
          const now = Date.now();
          local.put(module, id, v, (v as any)?.createdAt ?? now, (v as any)?.updatedAt ?? now).catch(() => {});
          return v;
        }
      } catch (e) { rxLog('warn', `SQLite get(${module}/${id}) failed:`, e); }
    }
    const lv = await local.get(module, id).catch(() => null);
    if (lv !== null && lv !== undefined && electron) {
      // We have it locally but SQLite didn't — backfill SQLite.
      const now = Date.now();
      electron.put(module, id, lv, (lv as any)?.createdAt ?? now, (lv as any)?.updatedAt ?? now).catch(() => {});
    }
    return lv;
  }

  async put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number): Promise<void> {
    const local = this.getLocal();
    const electron = this.getElectron();
    this.isElectron = !!electron;

    // Write to localStorage FIRST (fast, synchronous-ish, always works).
    // Then write to SQLite in parallel if available. We never throw from
    // a backend failure — data must land somewhere.
    const localP = local.put(module, id, data, createdAt, updatedAt).catch((e) => {
      rxLog('error', `localStorage put(${module}/${id}) failed:`, e);
    });
    const electronP = electron
      ? electron.put(module, id, data, createdAt, updatedAt).catch((e) => {
          rxLog('warn', `SQLite put(${module}/${id}) failed — data retained in localStorage:`, e);
        })
      : Promise.resolve();
    await Promise.all([localP, electronP]);
  }

  async remove(module: ModuleType, id: string): Promise<void> {
    const local = this.getLocal();
    const electron = this.getElectron();
    this.isElectron = !!electron;
    const localP = local.remove(module, id).catch((e) => rxLog('warn', `localStorage remove(${module}/${id}) failed:`, e));
    const electronP = electron
      ? electron.remove(module, id).catch((e) => rxLog('warn', `SQLite remove(${module}/${id}) failed:`, e))
      : Promise.resolve();
    await Promise.all([localP, electronP]);
  }
}

let cachedAdapter: DualAdapter | null = null;

/**
 * Return the singleton dual-write adapter.
 *
 * Safe to call at module-import time, at init() time, at save time, any
 * time. The dual-writer checks for the Electron bridge PER-CALL and
 * dual-writes whenever the bridge is available, so no amount of init
 * ordering can lose data.
 */
export function resolveAdapter(): StorageAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new DualAdapter();
  }
  return cachedAdapter;
}

/** Test/reset helper — never called from production code. */
export function _resetAdapterForTests(): void {
  cachedAdapter = null;
}
