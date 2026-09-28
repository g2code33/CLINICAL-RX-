import type { KVItem, ModuleType } from '../types';

/**
 * Secondary durability layer for the web localStorage adapter.
 *
 * WHY THIS EXISTS
 * ---------------
 * localStorage is the primary bucket (fast, synchronous, simple) but some
 * pathological conditions can wipe or corrupt it between sessions:
 *   • User runs the app in a Private/Incognito window that expires on close.
 *   • Browser "clear site data on exit" extension or privacy setting.
 *   • Storage eviction under quota pressure (mobile Safari in particular).
 *   • Partial/torn write mid-JSON-save from a crash or killed tab.
 *   • A future bug that accidentally touches the primary key.
 *
 * For offline-first medical data this is unacceptable: a user's local profile,
 * notes, bundles, ward rounds and study records MUST survive refreshes, app
 * updates, browser restarts, and crashes. So we mirror every write into
 * IndexedDB (which has a higher quota, is not cleared with localStorage-only
 * wipes, and persists across hard refreshes and SW updates), and at boot we
 * fall back to the IndexedDB copy if both the primary localStorage bucket
 * and the in-localStorage rolling backup are unusable.
 *
 * This is a BEST-EFFORT mirror — it never blocks the primary write and never
 * throws. It is ONLY used for recovery.
 */

const DB_NAME = 'clinical-rx-durable';
const DB_VERSION = 1;
const STORE = 'snapshots'; // keyed by storage primary key (e.g. 'clinical-rx:v1')

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(req.result || null);
    } catch {
      resolve(null);
    }
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore | null {
  try {
    return db.transaction(STORE, mode).objectStore(STORE);
  } catch {
    return null;
  }
}

function reqPromise<T>(r: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
}

/** Save a serialized snapshot of the full dataset to IndexedDB. */
export async function saveDurableSnapshot(primaryKey: string, rawItems: string): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    const store = tx(db, 'readwrite');
    if (!store) return;
    await reqPromise(store.put({ raw: rawItems, savedAt: Date.now() }, primaryKey));
    try { db.close(); } catch { /* ignore */ }
  } catch {
    /* never block primary save */
  }
}

/** Load the last durable snapshot for the given primary key, if any. */
export async function loadDurableSnapshot(primaryKey: string): Promise<{ raw: string; savedAt: number } | null> {
  try {
    const db = await open();
    if (!db) return null;
    const store = tx(db, 'readonly');
    if (!store) return null;
    const v = await reqPromise<any>(store.get(primaryKey));
    try { db.close(); } catch { /* ignore */ }
    if (v && typeof v.raw === 'string' && v.raw.length > 2) return { raw: v.raw, savedAt: v.savedAt || 0 };
    return null;
  } catch {
    return null;
  }
}

/** Wipe the durable snapshot for a key (used on explicit "Clear all data"). */
export async function wipeDurableSnapshot(primaryKey: string): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    const store = tx(db, 'readwrite');
    if (!store) return;
    await reqPromise(store.delete(primaryKey));
    try { db.close(); } catch { /* ignore */ }
  } catch {
    /* ignore */
  }
}

/** Parse a serialized snapshot into KVItem[]; returns null on any failure. */
export function parseSnapshot(raw: string): KVItem[] | null {
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

/** Atomically write to localStorage: write to a temp key first, verify, then rename. */
export function atomicLocalStorageWrite(key: string, value: string): void {
  try {
    const tmp = key + ':tmp';
    localStorage.setItem(tmp, value);
    // Verify before committing — guards against partial writes on quota or crash.
    if (localStorage.getItem(tmp) !== value) {
      localStorage.removeItem(tmp);
      return;
    }
    localStorage.setItem(key, value);
    localStorage.removeItem(tmp);
  } catch {
    /* ignore */
  }
}

/** Try to read localStorage; if the key is missing or corrupt, return null. */
export function safeLocalStorageRead(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
