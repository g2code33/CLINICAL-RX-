import type { KVItem, ModuleType, StorageAdapter } from '../types';

// Electron adapter: forwards all storage calls over the preload IPC bridge to
// the SQLite store running in the Electron main process. The preload exposes
// the bridge on window.clinicalRx — we call it with `any` so this module can
// be imported at the top of data.ts without requiring the bridge to exist
// yet (it will always exist by the time init() runs because init() is
// invoked after the preload has attached).
type Bridge = StorageAdapter & {
  platform: () => Promise<string>;
  installType?: () => Promise<string>;
};

function bridge(): Bridge {
  const w = window as any;
  if (!w.clinicalRx) {
    throw new Error('Electron bridge is not attached. This should never happen — did you call adapter methods before init()?');
  }
  return w.clinicalRx as Bridge;
}

export class ElectronAdapter implements StorageAdapter {
  isElectron = true;

  async platform() { return (await bridge().platform()) as string; }
  async list(module: ModuleType) { return (await bridge().list(module)) as KVItem[]; }
  async get(module: ModuleType, id: string) { return (await bridge().get(module, id)); }
  async put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number) {
    return bridge().put(module, id, data, createdAt, updatedAt);
  }
  async remove(module: ModuleType, id: string) { return bridge().remove(module, id); }
}
