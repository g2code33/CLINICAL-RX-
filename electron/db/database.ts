import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { records } from './schema';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { eq, sql } from 'drizzle-orm';

export interface KVStore {
  list(module: string): Promise<Array<{ id: string; module: string; data: string; createdAt: number; updatedAt: number }>>;
  get(module: string, id: string): Promise<any | null>;
  put(module: string, id: string, data: unknown, createdAt: number, updatedAt: number): Promise<void>;
  remove(module: string, id: string): Promise<void>;
  close(): void;
}

function openDatabase(): ReturnType<typeof drizzle> {
  const userData = app.getPath('userData');
  const dbDir = path.join(userData, 'clinical-rx');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const sqlite = new Database(path.join(dbDir, 'clinical-rx.db'));
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite);
  // Ensure the table exists (lightweight inline migration for v1).
  db.run(
    sql`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`
  );
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_records_module ON records (module)`);
  void migrate; // reserved for future drizzle migrations
  return db;
}

export class SqliteKV implements KVStore {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    this.db = openDatabase();
  }

  async list(module: string) {
    const rows = await this.db.select().from(records).where(eq(records.module, module));
    return rows.map((r) => ({
      id: r.id,
      module: r.module,
      data: r.data,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async get(module: string, id: string) {
    const rows = await this.db
      .select()
      .from(records)
      .where(sql`${records.module} = ${module} AND ${records.id} = ${id}`)
      .limit(1);
    if (!rows.length) return null;
    try {
      return JSON.parse(rows[0].data);
    } catch {
      return null;
    }
  }

  async put(module: string, id: string, data: unknown, createdAt: number, updatedAt: number) {
    const existing = await this.get(module, id);
    const json = JSON.stringify(data ?? {});
    if (existing) {
      await this.db
        .update(records)
        .set({ data: json, updatedAt })
        .where(sql`${records.module} = ${module} AND ${records.id} = ${id}`);
    } else {
      await this.db.insert(records).values({ id, module, data: json, createdAt, updatedAt });
    }
  }

  async remove(module: string, id: string) {
    await this.db.delete(records).where(sql`${records.module} = ${module} AND ${records.id} = ${id}`);
  }

  close() {
    // better-sqlite3 connection is held by drizzle's underlying database; nothing explicit to do here.
  }
}
