import { contextBridge, ipcRenderer } from 'electron';

// Minimal, typed IPC bridge exposed to the renderer. This is the ONLY way the
// UI talks to the local SQLite store, keeping the surface small and secure.
const api = {
  isElectron: true,
  platform: () => ipcRenderer.invoke('app:platform') as Promise<string>,
  installType: () => ipcRenderer.invoke('app:installType') as Promise<string>,
  notify: (payload: { title?: string; body?: string }) => ipcRenderer.invoke('notify', payload),
  list: (module: string) => ipcRenderer.invoke('kv:list', module),
  get: (module: string, id: string) => ipcRenderer.invoke('kv:get', module, id),
  put: (module: string, id: string, data: unknown, createdAt: number, updatedAt: number) =>
    ipcRenderer.invoke('kv:put', module, id, data, createdAt, updatedAt),
  remove: (module: string, id: string) => ipcRenderer.invoke('kv:remove', module, id),
  /**
   * Secure API-key vault. `set` writes to OS-encrypted storage; there is
   * deliberately NO `get` — the renderer can never read a key back.
   */
  secrets: {
    available: () => ipcRenderer.invoke('secret:available') as Promise<boolean>,
    set: (account: string, value: string) => ipcRenderer.invoke('secret:set', account, value),
    status: (account: string) =>
      ipcRenderer.invoke('secret:status', account) as Promise<{ present: boolean; hint?: string; length?: number }>,
    remove: (account: string) => ipcRenderer.invoke('secret:delete', account),
    list: () => ipcRenderer.invoke('secret:list') as Promise<string[]>,
    aiFetch: (account: string, url: string, init: unknown) => ipcRenderer.invoke('secret:aiFetch', account, url, init),
  },
  update: {
    getVersion: () => ipcRenderer.invoke('update:getVersion'),
    getState: () => ipcRenderer.invoke('update:getState'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb: (s: any) => void) => {
      const listener = (_e: any, payload: any) => cb(payload);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    },
  },
};

contextBridge.exposeInMainWorld('clinicalRx', api);

export type ClinicalRxApi = typeof api;
