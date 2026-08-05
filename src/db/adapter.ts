import type { ModuleType, StorageAdapter } from '../types';

// Global store resolution. The window's `clinicalRx` bridge is exposed by the
// Electron preload only when running inside Electron. On the web (Vercel) it is
// undefined and we fall back to the localStorage adapter.
declare global {
  interface Window {
    clinicalRx?: StorageAdapter & {
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
  return typeof window !== 'undefined' && !!window.clinicalRx && !!window.clinicalRx.isElectron;
}
