import { contextBridge, ipcRenderer } from 'electron';

// Minimal, typed IPC bridge exposed to the renderer. This is the ONLY way the
// UI talks to the local SQLite store, keeping the surface small and secure.
const api = {
  isElectron: true,
  platform: () => ipcRenderer.invoke('app:platform') as Promise<string>,
  installType: () => ipcRenderer.invoke('app:installType') as Promise<string>,
  list: (module: string) => ipcRenderer.invoke('kv:list', module),
  get: (module: string, id: string) => ipcRenderer.invoke('kv:get', module, id),
  put: (module: string, id: string, data: unknown, createdAt: number, updatedAt: number) =>
    ipcRenderer.invoke('kv:put', module, id, data, createdAt, updatedAt),
  remove: (module: string, id: string) => ipcRenderer.invoke('kv:remove', module, id),
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
