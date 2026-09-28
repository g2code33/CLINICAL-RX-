/**
 * Storage capability detection.
 *
 * Some browser contexts disable or partition persistent storage:
 *   • Safari ITP / "Prevent cross-site tracking" for third-party iframes
 *   • Chrome "Block third-party cookies" for embedded previews
 *   • Private/Incognito windows (session-only or quota=0)
 *   • The e2b/Arena preview iframe (sandboxed cross-origin)
 *   • Firefox "Delete cookies and site data when Firefox is closed"
 *   • Android WebView with a questionable data dir
 *
 * We PROBE storage at startup instead of assuming localStorage/IndexedDB are
 * available. If persistent storage is unavailable we degrade to sessionStorage
 * (survives reload in the same tab) and finally to in-memory storage with a
 * visible warning so the user knows data won't survive a restart.
 */

export type StorageBackend = 'localStorage' | 'sessionStorage' | 'memory';

export interface StorageBackendInfo {
  backend: StorageBackend;
  persistent: boolean; // true if data survives a hard refresh
  reason?: string;
}

const PROBE_KEY = '__crx_probe__';

function probeWebStorage(store: Storage | null): boolean {
  if (!store) return false;
  try {
    const v = 'crx_' + Date.now();
    store.setItem(PROBE_KEY, v);
    const ok = store.getItem(PROBE_KEY) === v;
    store.removeItem(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

function probeIndexedDB(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(false);
      let settled = false;
      const timeout = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, 1500);
      const req = indexedDB.open('__crx_probe__', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('p'); } catch {} };
      req.onsuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { req.result.close(); } catch {}
        const del = indexedDB.deleteDatabase('__crx_probe__');
        del.onsuccess = del.onerror = () => {};
        resolve(true);
      };
      req.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(false); } };
      req.onblocked = () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(false); } };
    } catch {
      resolve(false);
    }
  });
}

let cached: StorageBackendInfo | null = null;

export async function detectStorageBackend(): Promise<StorageBackendInfo> {
  if (cached) return cached;
  if (probeWebStorage(typeof localStorage !== 'undefined' ? localStorage : null)) {
    // localStorage works — check if it actually persists across reloads by
    // leaving a marker and reading it back next boot.
    cached = { backend: 'localStorage', persistent: true };
    return cached;
  }
  if (probeWebStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : null)) {
    cached = { backend: 'sessionStorage', persistent: false, reason: 'localStorage unavailable; using sessionStorage (data lasts until you close the tab).' };
    return cached;
  }
  // Last resort: in-memory.
  cached = { backend: 'memory', persistent: false, reason: 'Browser storage is blocked — data will NOT survive a reload. Open the app directly (not in a preview iframe) to save your work.' };
  return cached;
}

/** Get a reference to the active Storage-like object (localStorage or sessionStorage). */
export function activeWebStorage(info: StorageBackendInfo): Storage | null {
  if (info.backend === 'localStorage' && typeof localStorage !== 'undefined') return localStorage;
  if (info.backend === 'sessionStorage' && typeof sessionStorage !== 'undefined') return sessionStorage;
  return null;
}

/** Return true if IndexedDB is actually usable. */
export async function indexedDbAvailable(): Promise<boolean> {
  return await probeIndexedDB();
}

/** Reset detection cache (only used by tests). */
export function _resetDetectionForTests(): void {
  cached = null;
}
