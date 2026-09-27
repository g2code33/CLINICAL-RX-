import { ElectronAdapter } from './electronAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import type { StorageAdapter } from '../types';

// Global store resolution. The window's `clinicalRx` bridge is exposed by the
// Electron preload only when running inside Electron. On the web (Vercel) it is
// undefined and we fall back to the localStorage adapter.
//
// IMPORTANT — resolve the adapter lazily, NOT at module-import time.
//
// In Electron, the preload script attaches `window.clinicalRx` during renderer
// setup, but the JS bundle's top-level imports can (and do) evaluate before
// that assignment completes. Checking `window.clinicalRx` at module load would
// see undefined, pick the localStorage adapter, silently write the profile to
// the renderer's localStorage sandbox (which Electron clears between
// sessions), and the user would see Onboarding on every launch even though the
// SQLite DB is right there. By resolving in resolveAdapter() at init() time
// we guarantee the preload bridge is in place.
declare global {
  interface Window {
    clinicalRx?: StorageAdapter & {
      isElectron?: boolean;
      installType?: () => Promise<string>;
      notify?: (payload: { title?: string; body?: string }) => Promise<{ ok: boolean }>;
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

let cachedAdapter: StorageAdapter | null = null;

/**
 * Return the correct StorageAdapter for this runtime.
 *
 * Safe to call multiple times — returns the same adapter instance. Call only
 * AFTER the DOM/preload is ready (i.e. from within init(), not at module
 * scope) so `window.clinicalRx` is guaranteed to exist in Electron.
 */
export function resolveAdapter(): StorageAdapter {
  if (cachedAdapter) return cachedAdapter;
  if (hasElectronBridge()) {
    cachedAdapter = new ElectronAdapter();
  } else {
    cachedAdapter = new LocalStorageAdapter();
  }
  return cachedAdapter;
}

/** Test/reset helper — never called from production code. */
export function _resetAdapterForTests(): void {
  cachedAdapter = null;
}

