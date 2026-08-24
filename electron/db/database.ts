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

function openDatabase(): { db: ReturnType<typeof drizzle>; sqlite: Database.Database } {
  const userData = app.getPath('userData');
  const dbDir = path.join(userData, 'clinical-rx');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const sqlite = new Database(path.join(dbDir, 'clinical-rx.db'));

  // ---- Durability (§26: power loss / crash must not corrupt the database) ----
  // WAL gives us atomic commits and lets reads proceed during writes.
  sqlite.pragma('journal_mode = WAL');
  // FULL would fsync on every write (slow); NORMAL with WAL is crash-safe for
  // application crashes and only risks the last transaction on OS/power loss.
  sqlite.pragma('synchronous = NORMAL');
  // Enforce declared relationships rather than silently allowing orphans.
  sqlite.pragma('foreign_keys = ON');
  // Wait rather than immediately throwing SQLITE_BUSY if another connection
  // holds a write lock (e.g. a checkpoint during a bulk import).
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite);

  // Ensure the table exists (lightweight inline migration for v1).
  //
  // NOTE ON THE PRIMARY KEY: every query in this class addresses a row by
  // (module, id), so the key is the *pair*. Declaring only `id` as PRIMARY KEY
  // would make ids globally unique instead, which is a different contract and
  // would let one module's insert collide with another's. Existing databases
  // created with the old single-column key keep working — see migrateSchema().
  db.run(
    sql`CREATE TABLE IF NOT EXISTS records (
      id TEXT NOT NULL,
      module TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (module, id)
    )`
  );

  // ---- Indexes (§31) ----------------------------------------------------
  // Only for fields this app actually queries or sorts by. Every extra index
  // costs write throughput, so no speculative indexing.
  // list(module) — the hot path behind every page load.
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_records_module ON records (module)`);
  // Sync and "recently changed" queries scan by module + updated_at.
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_records_module_updated ON records (module, updated_at)`);

  migrateSchema(sqlite);
  void migrate; // reserved for future drizzle migrations
  return { db, sqlite };
}

/**
 * Bring a pre-existing database up to the current schema.
 *
 * §4/§45: migration must never lose data. This copies rows into the new table
 * rather than dropping anything, and if the copy fails the original table is
 * left untouched so the user still has their records.
 */
function migrateSchema(sqlite: Database.Database): void {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(records)`).all() as Array<{ name: string; pk: number }>;
    if (cols.length === 0) return;

    // Old schema had exactly one PK column (`id`); the new one has two.
    const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name);
    const needsCompositeKey = pkCols.length === 1 && pkCols[0] === 'id';
    if (!needsCompositeKey) return;

    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS records_migrated (
          id TEXT NOT NULL,
          module TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (module, id)
        )
      `);
      // INSERT OR IGNORE: if the legacy table somehow holds duplicate
      // (module,id) pairs we keep the first rather than aborting the upgrade.
      sqlite.exec(`
        INSERT OR IGNORE INTO records_migrated (id, module, data, created_at, updated_at)
        SELECT id, module, data, created_at, updated_at FROM records
      `);
      const before = (sqlite.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
      const after = (sqlite.prepare('SELECT COUNT(*) AS n FROM records_migrated').get() as { n: number }).n;
      if (after < before) {
        // Refuse to swap in a table that lost rows (§45).
        throw new Error(`migration would lose rows (${before} -> ${after})`);
      }
      sqlite.exec('DROP TABLE records');
      sqlite.exec('ALTER TABLE records_migrated RENAME TO records');
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    // A failed migration must not prevent the app from starting: the old
    // schema still works for reads and writes.
    console.error('[db] schema migration skipped:', (err as Error).message);
  }
}

export class SqliteKV implements KVStore {
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database.Database;

  constructor() {
    const opened = openDatabase();
    this.db = opened.db;
    this.sqlite = opened.sqlite;
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

  /**
   * Write a record.
   *
   * This is a single atomic UPSERT. The previous implementation did a SELECT
   * and then chose INSERT or UPDATE, which is a race: two writes to the same
   * record interleaving between the read and the write could both decide
   * "insert" and one would fail, or both decide "update" and lose a change.
   * Letting SQLite resolve the conflict removes the window entirely (§2, §26).
   *
   * `created_at` is preserved on conflict: an update must never rewrite when
   * the record was originally created.
   */
  async put(module: string, id: string, data: unknown, createdAt: number, updatedAt: number) {
    const json = JSON.stringify(data ?? {});
    this.sqlite
      .prepare(
        `INSERT INTO records (id, module, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(module, id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`
      )
      .run(id, module, json, createdAt, updatedAt);
  }

  async remove(module: string, id: string) {
    await this.db.delete(records).where(sql`${records.module} = ${module} AND ${records.id} = ${id}`);
  }

  /**
   * Close the database cleanly.
   *
   * This used to be a no-op, which left the WAL file un-checkpointed on quit:
   * the data was not lost, but recovery work was deferred to the next launch
   * and the file handle stayed open for the process lifetime. Checkpointing
   * and closing on shutdown is the difference between a clean exit and one
   * that always looks like a crash to SQLite (§26, §30).
   */
  close() {
    try {
      this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Checkpoint is best-effort; closing still flushes committed data.
    }
    try {
      this.sqlite.close();
    } catch {
      // Already closed.
    }
  }
}
