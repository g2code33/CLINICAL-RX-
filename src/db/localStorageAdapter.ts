import type { KVItem, ModuleType, StorageAdapter } from '../types';

// Browser/web storage adapter. Persists all records as JSON under a single
// localStorage key. Used when running on Vercel (no Electron main process).
// Suitable for the web experience; desktop uses SQLite via IPC.
export class LocalStorageAdapter implements StorageAdapter {
  isElectron = false;
  private key = 'clinical-rx:v1';
  private items: KVItem[];

  constructor() {
    this.items = this.load();
  }

  private load(): KVItem[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private save() {
    localStorage.setItem(this.key, JSON.stringify(this.items));
  }

  async platform() {
    return typeof navigator !== 'undefined' && /win/i.test(navigator.platform) ? 'win32' : 'linux';
  }

  async list(module: ModuleType): Promise<KVItem[]> {
    return this.items.filter((i) => i.module === module);
  }

  async get(module: ModuleType, id: string): Promise<any | null> {
    const item = this.items.find((i) => i.module === module && i.id === id);
    if (!item) return null;
    try {
      return JSON.parse(item.data);
    } catch {
      return null;
    }
  }

  async put(module: ModuleType, id: string, data: unknown, createdAt: number, updatedAt: number): Promise<void> {
    const idx = this.items.findIndex((i) => i.module === module && i.id === id);
    const json = JSON.stringify(data ?? {});
    if (idx >= 0) {
      this.items[idx] = { ...this.items[idx], data: json, updatedAt };
    } else {
      this.items.push({ id, module, data: json, createdAt, updatedAt });
    }
    this.save();
  }

  async remove(module: ModuleType, id: string): Promise<void> {
    this.items = this.items.filter((i) => !(i.module === module && i.id === id));
    this.save();
  }
}
