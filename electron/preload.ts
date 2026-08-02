import { contextBridge, ipcRenderer } from 'electron';

// Minimal, typed IPC bridge exposed to the renderer. This is the ONLY way the
// UI talks to the local SQLite store, keeping the surface small and secure.
const api = {
  isElectron: true,
  platform: () => ipcRenderer.invoke('app:platform') as Promise<string>,
  list: (module: string) => ipcRenderer.invoke('kv:list', module),
  get: (module: string, id: string) => ipcRenderer.invoke('kv:get', module, id),
  put: (module: string, id: string, data: unknown, createdAt: number, updatedAt: number) =>
    ipcRenderer.invoke('kv:put', module, id, data, createdAt, updatedAt),
  remove: (module: string, id: string) => ipcRenderer.invoke('kv:remove', module, id),
};

contextBridge.exposeInMainWorld('clinicalRx', api);

export type ClinicalRxApi = typeof api;
