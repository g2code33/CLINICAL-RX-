import type { ModuleType, StorageAdapter } from '../types';

// Global store resolution. The window's `clinicalRx` bridge is exposed by the
// Electron preload only when running inside Electron. On the web (Vercel) it is
// undefined and we fall back to the localStorage adapter.
declare global {
  interface Window {
    clinicalRx?: StorageAdapter;
  }
}

export function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && !!window.clinicalRx && !!window.clinicalRx.isElectron;
}
