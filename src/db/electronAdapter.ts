import type { ModuleType, StorageAdapter } from '../types';

// Electron adapter: forwards all storage calls over the preload IPC bridge to
// the SQLite store running in the Electron main process.
export class ElectronAdapter implements StorageAdapter {
  isElectron = true;

  async platform() {
    return (await window.clinicalRx!.platform()) as string;
  }

  async list(module: ModuleType) {
    return window.clinicalRx!.list(module);
  }

  async get(module: ModuleType, id: string) {
    return window.clinicalRx!.get(module, id);
  }

  async put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number) {
    return window.clinicalRx!.put(module, id, data, createdAt, updatedAt);
  }

  async remove(module: ModuleType, id: string) {
    return window.clinicalRx!.remove(module, id);
  }
}
