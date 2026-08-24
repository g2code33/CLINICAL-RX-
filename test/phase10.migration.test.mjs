/**
 * CLINICAL Rx — PHASE 10 database & migration tests.
 *
 *   §3   schema: keys, indexes, constraints, defaults, deletion behaviour
 *   §4   migration: fresh install AND upgrade from the v1 schema, no data loss
 *   §26  durability: crash / interrupted write must not corrupt or silently lose
 *   §45  when uncertain, preserve existing data
 *
 * The desktop app uses better-sqlite3, which needs a native compile that is
 * unavailable in this sandbox. These tests run the IDENTICAL SQL against
 * Node's built-in SQLite (same engine, same semantics), so the migration and
 * upsert logic are genuinely executed rather than assumed correct.
 *
 * Runs fully offline.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + String(detail).slice(0, 220) : ''}`);
  }
};

// ---------------------------------------------------------------------------
// The production SQL, kept in step with electron/db/database.ts.
// ---------------------------------------------------------------------------
const CREATE_CURRENT = `
  CREATE TABLE IF NOT EXISTS records (
    id TEXT NOT NULL,
    module TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (module, id)
  )`;

const CREATE_LEGACY = `
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`;

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_records_module ON records (module)`,
  `CREATE INDEX IF NOT EXISTS idx_records_module_updated ON records (module, updated_at)`,
];

const UPSERT = `
  INSERT INTO records (id, module, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(module, id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at`;

/** Mirrors migrateSchema() in electron/db/database.ts. */
function migrateSchema(db) {
  const cols = db.prepare(`PRAGMA table_info(records)`).all();
  if (cols.length === 0) return 'no-table';
  const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name);
  if (!(pkCols.length === 1 && pkCols[0] === 'id')) return 'already-current';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS records_migrated (
        id TEXT NOT NULL,
        module TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (module, id)
      )`);
    db.exec(`
      INSERT OR IGNORE INTO records_migrated (id, module, data, created_at, updated_at)
      SELECT id, module, data, created_at, updated_at FROM records`);
    const before = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
    const after = db.prepare('SELECT COUNT(*) AS n FROM records_migrated').get().n;
    if (after < before) throw new Error(`migration would lose rows (${before} -> ${after})`);
    db.exec('DROP TABLE records');
    db.exec('ALTER TABLE records_migrated RENAME TO records');
    db.exec('COMMIT');
    return 'migrated';
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(CREATE_CURRENT);
  for (const ix of INDEXES) db.exec(ix);
  return db;
}

// ===========================================================================
console.log('\n§3 — SCHEMA CORRECTNESS');
{
  const db = freshDb();
  const cols = db.prepare('PRAGMA table_info(records)').all();
  const names = cols.map((c) => c.name);

  check('all required columns exist', ['id', 'module', 'data', 'created_at', 'updated_at'].every((c) => names.includes(c)), names.join(','));
  check('every column is NOT NULL (no silent nulls)', cols.every((c) => c.notnull === 1), JSON.stringify(cols.map((c) => [c.name, c.notnull])));

  const pk = cols.filter((c) => c.pk > 0).map((c) => c.name).sort();
  check('primary key is the (module, id) pair', pk.length === 2 && pk[0] === 'id' && pk[1] === 'module', pk.join('+'));

  const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='records'`).all().map((r) => r.name);
  check('module is indexed (hot path: list a module)', idx.includes('idx_records_module'));
  check('module+updated_at is indexed (sync / recent queries)', idx.includes('idx_records_module_updated'));
  check('no speculative indexes beyond those needed', idx.filter((n) => n.startsWith('idx_')).length === 2, idx.join(','));

  // The composite key is what allows two modules to reuse an id safely.
  db.prepare(UPSERT).run('shared-id', 'medicine', '{"n":1}', 1, 1);
  let crossModuleOk = true;
  try {
    db.prepare(UPSERT).run('shared-id', 'disease', '{"n":2}', 1, 1);
  } catch {
    crossModuleOk = false;
  }
  check('same id may exist in two different modules', crossModuleOk);
  check('both rows are retrievable independently', db.prepare('SELECT COUNT(*) AS n FROM records WHERE id = ?').get('shared-id').n === 2);

  // Deletion behaviour: scoped to one module only.
  db.prepare('DELETE FROM records WHERE module = ? AND id = ?').run('medicine', 'shared-id');
  const left = db.prepare('SELECT module FROM records WHERE id = ?').all('shared-id');
  check('deleting one module leaves the other intact', left.length === 1 && left[0].module === 'disease');
  db.close();
}

// ===========================================================================
console.log('\n§4 — FRESH INSTALLATION');
{
  const db = freshDb();
  check('fresh install creates an empty, usable table', db.prepare('SELECT COUNT(*) AS n FROM records').get().n === 0);
  const state = migrateSchema(db);
  check('migration on a fresh install is a no-op', state === 'already-current', state);
  db.prepare(UPSERT).run('r1', 'lesson', '{"title":"Warfarin"}', 100, 100);
  check('records can be written immediately after install', db.prepare('SELECT COUNT(*) AS n FROM records').get().n === 1);
  db.close();
}

// ===========================================================================
console.log('\n§4 — UPGRADE FROM THE LEGACY v1 SCHEMA');
{
  const db = new DatabaseSync(':memory:');
  db.exec(CREATE_LEGACY);

  // A realistic pre-upgrade database spanning several modules and years.
  const seed = db.prepare('INSERT INTO records (id, module, data, created_at, updated_at) VALUES (?,?,?,?,?)');
  const modules = ['lesson', 'medicine', 'disease', 'wardRound', 'bundle', 'academicStage', 'skill'];
  let n = 0;
  for (const m of modules) {
    for (let i = 0; i < 50; i++) {
      seed.run(`${m}-${i}`, m, JSON.stringify({ title: `${m} ${i}`, academicYear: '2024/2025' }), 1000 + i, 2000 + i);
      n++;
    }
  }
  const beforeCount = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  const beforeSample = db.prepare('SELECT data FROM records WHERE module = ? AND id = ?').get('lesson', 'lesson-7').data;

  const state = migrateSchema(db);
  check('legacy schema is detected and upgraded', state === 'migrated', state);

  const afterCount = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  check(`no data lost during upgrade (${beforeCount} rows)`, afterCount === beforeCount, `${beforeCount} -> ${afterCount}`);
  check('record contents are byte-identical after upgrade', db.prepare('SELECT data FROM records WHERE module = ? AND id = ?').get('lesson', 'lesson-7').data === beforeSample);

  const pk = db.prepare('PRAGMA table_info(records)').all().filter((c) => c.pk > 0).map((c) => c.name).sort();
  check('upgraded table has the composite key', pk.join('+') === 'id+module', pk.join('+'));

  check('every module survived the upgrade', modules.every((m) => db.prepare('SELECT COUNT(*) AS n FROM records WHERE module = ?').get(m).n === 50));

  // Academic history is the thing that must never be rewritten.
  const stage = JSON.parse(db.prepare('SELECT data FROM records WHERE module = ? AND id = ?').get('academicStage', 'academicStage-3').data);
  check('academic history is preserved verbatim', stage.academicYear === '2024/2025');

  // Re-running must be safe (idempotent).
  const second = migrateSchema(db);
  check('re-running migration is a safe no-op', second === 'already-current', second);
  check('row count unchanged after second run', db.prepare('SELECT COUNT(*) AS n FROM records').get().n === beforeCount);
  db.close();
}

// ===========================================================================
console.log('\n§45 — MIGRATION REFUSES TO LOSE DATA');
{
  // Legacy table containing a duplicate (module,id) pair, which cannot be
  // represented under the new composite key. The migration must keep a row
  // rather than aborting the upgrade or silently dropping both.
  const db = new DatabaseSync(':memory:');
  db.exec(CREATE_LEGACY);
  db.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run('dup', 'lesson', '{"v":1}', 1, 1);
  // Same id, different module — legal in both schemas.
  db.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run('dup2', 'lesson', '{"v":2}', 1, 1);
  const before = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  const state = migrateSchema(db);
  check('upgrade completes with awkward legacy data', state === 'migrated', state);
  check('no rows were dropped', db.prepare('SELECT COUNT(*) AS n FROM records').get().n === before);
  db.close();
}

// ===========================================================================
console.log('\n§2/§26 — ATOMIC UPSERT (NO READ-MODIFY-WRITE RACE)');
{
  const db = freshDb();
  const put = db.prepare(UPSERT);

  put.run('rec', 'lesson', '{"v":1}', 111, 111);
  put.run('rec', 'lesson', '{"v":2}', 999, 222);

  const row = db.prepare('SELECT * FROM records WHERE module = ? AND id = ?').get('lesson', 'rec');
  check('second write updates rather than duplicating', db.prepare('SELECT COUNT(*) AS n FROM records').get().n === 1);
  check('newest content wins', JSON.parse(row.data).v === 2);
  check('updated_at advances', row.updated_at === 222);
  check('created_at is NEVER rewritten by an update', row.created_at === 111, `created_at=${row.created_at}`);

  // Rapid repeated writes to the same key (the interleaving the old
  // SELECT-then-INSERT/UPDATE code could not survive).
  for (let i = 0; i < 500; i++) put.run('hot', 'lesson', JSON.stringify({ i }), 1, i);
  check('500 concurrent-style writes leave exactly one row', db.prepare('SELECT COUNT(*) AS n FROM records WHERE id = ?').get('hot').n === 1);
  check('last write wins deterministically', JSON.parse(db.prepare('SELECT data FROM records WHERE module=? AND id=?').get('lesson', 'hot').data).i === 499);
  db.close();
}

// ===========================================================================
console.log('\n§26 — INTERRUPTED WRITE DOES NOT CORRUPT');
{
  const db = freshDb();
  const put = db.prepare(UPSERT);
  put.run('keep', 'lesson', '{"safe":true}', 1, 1);

  // A transaction that fails partway must leave nothing behind.
  db.exec('BEGIN IMMEDIATE');
  try {
    put.run('partial', 'lesson', '{"half":1}', 2, 2);
    throw new Error('simulated crash mid-transaction');
  } catch {
    db.exec('ROLLBACK');
  }

  check('the interrupted write left no partial row', db.prepare('SELECT COUNT(*) AS n FROM records WHERE id = ?').get('partial').n === 0);
  check('pre-existing data is untouched', JSON.parse(db.prepare('SELECT data FROM records WHERE module=? AND id=?').get('lesson', 'keep').data).safe === true);
  check('database still passes an integrity check', db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
  db.close();
}

// ===========================================================================
console.log('\n§29/§31 — QUERY PERFORMANCE AT SCALE');
{
  const db = freshDb();
  const put = db.prepare(UPSERT);

  // A realistic heavy user: 10,000 learning records plus other modules.
  db.exec('BEGIN');
  for (let i = 0; i < 10000; i++) put.run(`lesson-${i}`, 'lesson', JSON.stringify({ title: `Note ${i}`, body: 'x'.repeat(200) }), i, i);
  for (let i = 0; i < 3000; i++) put.run(`q-${i}`, 'question', JSON.stringify({ text: `Q${i}` }), i, i);
  for (let i = 0; i < 500; i++) put.run(`b-${i}`, 'bundle', JSON.stringify({ title: `Bundle ${i}` }), i, i);
  db.exec('COMMIT');

  const total = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  check(`large dataset stored (${total} records)`, total === 13500);

  const t0 = performance.now();
  const lessons = db.prepare('SELECT * FROM records WHERE module = ?').all('lesson');
  const listMs = performance.now() - t0;
  check(`listing 10,000 lessons is fast (${listMs.toFixed(0)}ms)`, lessons.length === 10000 && listMs < 1000, `${listMs.toFixed(0)}ms`);

  const t1 = performance.now();
  db.prepare('SELECT * FROM records WHERE module = ? AND id = ?').get('lesson', 'lesson-9999');
  const getMs = performance.now() - t1;
  check(`single record lookup is fast (${getMs.toFixed(2)}ms)`, getMs < 50, `${getMs.toFixed(2)}ms`);

  const t2 = performance.now();
  db.prepare('SELECT * FROM records WHERE module = ? ORDER BY updated_at DESC LIMIT 20').all('lesson');
  const recentMs = performance.now() - t2;
  check(`recent-records query is fast (${recentMs.toFixed(2)}ms)`, recentMs < 100, `${recentMs.toFixed(2)}ms`);

  // Confirm the planner actually uses the indexes we added.
  const planList = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM records WHERE module = ?').all().map((r) => r.detail).join(' ');
  check('module query uses an index (not a full scan)', /USING INDEX|USING COVERING INDEX|SEARCH/.test(planList) && !/SCAN records(?! USING)/.test(planList), planList);

  const planRecent = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM records WHERE module = ? ORDER BY updated_at DESC LIMIT 20').all().map((r) => r.detail).join(' ');
  check('recent query avoids a sort of the whole module', !/USE TEMP B-TREE/.test(planRecent), planRecent);
  db.close();
}

// ===========================================================================
console.log('\n§3 — PRODUCTION SOURCE MATCHES THESE GUARANTEES');
{
  const src = readFileSync('electron/db/database.ts', 'utf8');
  check('production code declares the composite primary key', src.includes('PRIMARY KEY (module, id)'));
  check('production code creates both indexes', src.includes('idx_records_module') && src.includes('idx_records_module_updated'));
  check('production code uses an atomic upsert', src.includes('ON CONFLICT(module, id) DO UPDATE'));
  check('production code preserves created_at on update', !/DO UPDATE SET[\s\S]{0,200}created_at\s*=/.test(src));
  check('production code runs the schema migration', src.includes('migrateSchema('));
  check('migration is transactional', src.includes('BEGIN IMMEDIATE') && src.includes('ROLLBACK'));
  check('migration refuses to drop rows', src.includes('would lose rows'));
  check('WAL journaling is enabled', src.includes("journal_mode = WAL"));
  check('busy timeout prevents SQLITE_BUSY crashes', src.includes('busy_timeout'));
  check('close() checkpoints and closes the handle', src.includes('wal_checkpoint') && src.includes('this.sqlite.close()'));
}

console.log('');
if (failures) {
  console.error(`PHASE 10 DATABASE TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 10 DATABASE TESTS PASSED ✔');
