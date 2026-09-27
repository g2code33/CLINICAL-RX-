import { ElectronAdapter } from './electronAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import type { StorageAdapter } from '../types';

// ---------------------------------------------------------------------------
// Adapter resolution — the one source of truth for "where does data go?"
//
// HISTORY (do NOT regress this):
//
// 1) The original code picked the adapter at module-import time:
//        adapter: hasElectronBridge() ? new ElectronAdapter() : new LocalStorageAdapter()
//    Under Electron the preload script attaches window.clinicalRx during
//    renderer setup, but top-level module evaluation runs BEFORE that
//    assignment completes in some launch timings (especially on Linux/.deb
//    where Chromium's preload → main-world handoff is slightly different).
//    The check saw undefined, silently picked localStorage, and every save
//    went to the renderer's partitioned localStorage which gets wiped when
//    the renderer exits — so every fresh launch showed "Get Started".
//
// 2) v1.11.16 moved the resolution to resolveAdapter() called from init().
//    That fixed the module-load race but a stale cached adapter could still
//    survive if init() ran early on some code paths.
//
// 3) v1.11.17 makes resolution SELF-CORRECTING: every adapter method checks
//    at call time whether the Electron bridge is now present, and hot-swaps
//    to ElectronAdapter the moment it appears. This means even if the first
//    few calls hit localStorage, the moment the bridge is attached all
//    subsequent calls (and any future data access) go to SQLite. Combined
//    with the migration step in init() that re-pulls from the now-correct
//    backend, this makes the "Get Started on every restart" bug impossible.
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

let cachedAdapter: StorageAdapter | null = null;
let warnedLocalInElectron = false;

/**
 * ALWAYS returns the best adapter for the CURRENT runtime state.
 *
 * Unlike the previous implementation this HOT-SWAPS to ElectronAdapter the
 * instant the preload bridge appears, even if we were previously using
 * localStorage. This makes it impossible to "miss" the bridge because of an
 * initialization race.
 */
export function resolveAdapter(): StorageAdapter {
  if (hasElectronBridge()) {
    if (!(cachedAdapter instanceof ElectronAdapter)) {
      if (warnedLocalInElectron) {
        // We previously fell back to localStorage because the bridge wasn't
        // ready when resolveAdapter() was first called; now that the bridge
        // is attached, switch — and log loudly so this is visible in devtools
        // / terminal if it ever recurs.
        rxLog('warn', 'clinical-rx: bridge now available — switching from localStorage to SQLite.');
      }
      cachedAdapter = new ElectronAdapter();
    }
    return cachedAdapter;
  }

  if (!cachedAdapter) {
    cachedAdapter = new LocalStorageAdapter();
    // In Electron we expect the bridge to exist. If at resolution time it
    // does not, log a warning the moment the bridge DOES appear (handled
    // above) so the hot-swap can proceed — and surface a console warning now
    // so devs can see the race if it ever happens in the wild.
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' &&
        /electron/i.test(navigator.userAgent || '')) {
      warnedLocalInElectron = true;
      rxLog('warn', 'clinical-rx: bridge not attached at adapter resolution — using localStorage temporarily; will hot-swap to SQLite when bridge appears.');
      // Poll for the bridge for 5 seconds to ensure hot-swap happens ASAP.
      // After that, calls will still self-correct on first method invocation.
      let attempts = 0;
      const poll = () => {
        attempts++;
        if (hasElectronBridge()) {
          resolveAdapter(); // swap now
          return;
        }
        if (attempts < 50) setTimeout(poll, 100);
      };
      setTimeout(poll, 0);
    }
  }
  return cachedAdapter;
}

function rxLog(level: 'log' | 'warn' | 'error' | 'info', ...args: unknown[]) {
  try {
    if (typeof console !== 'undefined') {
      (console as any)[level]?.(...args);
    }
    // Also forward to the main process (visible in terminal / syslog) if the
    // bridge is already attached. Safe to ignore if not.
    if (typeof window !== 'undefined' && window.clinicalRx && typeof (window.clinicalRx as any).log === 'function') {
      try { (window.clinicalRx as any).log(level, ...args); } catch { /* ignore */ }
    }
  } catch { /* logging must never throw */ }
}

/** Test/reset helper — never called from production code. */
export function _resetAdapterForTests(): void {
  cachedAdapter = null;
  warnedLocalInElectron = false;
}
