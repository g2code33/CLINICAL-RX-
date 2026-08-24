import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import type { ModuleType, PendingOp, SyncRecord } from '../types';

const PENDING_KEY = 'clinical-rx:sync-pending';
const TOMBSTONE_KEY = 'clinical-rx:sync-tombstones';

/**
 * Every module that participates in cloud sync.
 *
 * Derived deliberately as one exported list so a new module can never be
 * silently left out of `applyServerRecords` again — that bug made Phase 6's
 * professional records upload but never download.
 *
 * `profile` and `settings` are excluded on purpose: they hold device-scoped
 * state (API keys, backend URL, session token) and are handled separately.
 * `chat` is excluded here and gated behind an explicit opt-in (§35).
 */
export const SYNCED_MODULES: ModuleType[] = [
  'day', 'disease', 'medicine', 'investigation', 'question', 'lesson',
  'revision', 'bundle', 'quiz', 'reminder',
  'wardRound', 'wardEntry', 'wardAnalysis',
  'academicStage', 'academicPeriod', 'course', 'activity',
  // Phase 6 — professional journey
  'clinicalExperience', 'skill', 'achievement', 'certification',
  'project', 'research', 'leadership', 'goal',
];

/** AI conversations sync ONLY when the user opts in (§35). */
export const OPT_IN_MODULES: ModuleType[] = ['chat'];

/** User-facing sync categories (§34). */
export const SYNC_CATEGORIES: Array<{ key: string; label: string; modules: ModuleType[] }> = [
  { key: 'academic', label: 'Academic', modules: ['academicStage', 'academicPeriod', 'course'] },
  { key: 'clinical', label: 'Clinical Learning', modules: ['day', 'disease', 'medicine', 'investigation', 'lesson'] },
  { key: 'ward', label: 'Ward Rounds', modules: ['wardRound', 'wardEntry', 'wardAnalysis'] },
  { key: 'bundles', label: 'Bundles', modules: ['bundle'] },
  { key: 'revision', label: 'Revision & Questions', modules: ['revision', 'question', 'quiz'] },
  { key: 'professional', label: 'Professional Journey', modules: ['clinicalExperience', 'skill', 'achievement', 'certification', 'project', 'research', 'leadership', 'goal'] },
  { key: 'ai', label: 'AI Conversations', modules: ['chat'] },
];

/** True when AI conversations may be synchronised. Defaults to OFF. */
export function aiSyncEnabled(): boolean {
  return useData.getState().settings?.onlineAccount?.syncAiConversations === true;
}

/** Modules to sync right now, honouring the AI opt-in. */
export function activeSyncModules(): ModuleType[] {
  return aiSyncEnabled() ? [...SYNCED_MODULES, ...OPT_IN_MODULES] : SYNCED_MODULES;
}

// ---- Tombstones (§24) ---------------------------------------------------
//
// A deletion must propagate to other devices, and must NOT be resurrected by
// a later pull that still carries the old record. We remember what this
// device deleted, and refuse to re-create those ids from server data.

interface Tombstone { module: string; id: string; deletedAt: number; }

export function loadTombstones(): Tombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveTombstones(list: Tombstone[]) {
  try {
    // Keep the list bounded; 90 days is far longer than any realistic
    // offline gap between devices.
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(list.filter((t) => t.deletedAt > cutoff).slice(-2000)));
  } catch {
    /* ignore */
  }
}

export function addTombstone(module: string, id: string): void {
  const list = loadTombstones().filter((t) => !(t.module === module && t.id === id));
  list.push({ module, id, deletedAt: Date.now() });
  saveTombstones(list);
}

function isTombstoned(module: string, id: string, serverUpdatedAt: number): boolean {
  const t = loadTombstones().find((x) => x.module === module && x.id === id);
  // Only suppress when the deletion is NEWER than the server copy; otherwise
  // the record was legitimately re-created elsewhere after we deleted it.
  return !!t && t.deletedAt >= serverUpdatedAt;
}

export function clearTombstone(module: string, id: string): void {
  saveTombstones(loadTombstones().filter((t) => !(t.module === module && t.id === id)));
}

// ---- Offline queue (persisted) ----
export function loadPending(): PendingOp[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function savePending(ops: PendingOp[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch {
    /* ignore */
  }
}

/** Queue an operation. Called from the data store whenever a record is saved/deleted. */
export function enqueue(op: PendingOp) {
  const pending = loadPending();
  // Replace any prior op for the same record (latest wins).
  const rest = pending.filter((p) => !(p.module === op.module && p.id === op.id));
  rest.push(op);
  savePending(rest);
}

export function getPendingCount(): number {
  return loadPending().length;
}

export function backendConfigured(): boolean {
  const s = useData.getState();
  const acct = s.settings?.onlineAccount;
  if (!acct) return false;
  return !!acct.connected && !!acct.token && acct.backendUrl !== undefined;
}

function settingsToken(): string {
  return useData.getState().settings?.onlineAccount?.token ?? '';
}
function backendUrl(): string {
  return useData.getState().settings?.onlineAccount?.backendUrl ?? '';
}

// ---- Conflicts (§21, §22) ----------------------------------------------

const CONFLICT_KEY = 'clinical-rx:sync-conflicts';

export interface SyncConflict {
  module: string;
  id: string;
  title: string;
  localUpdatedAt: number;
  serverUpdatedAt: number;
  /** Field names that were changed differently on each side. */
  fields: string[];
  localData: unknown;
  serverData: unknown;
  detectedAt: number;
}

export function loadConflicts(): SyncConflict[] {
  try {
    const raw = localStorage.getItem(CONFLICT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveConflicts(list: SyncConflict[]) {
  try {
    localStorage.setItem(CONFLICT_KEY, JSON.stringify(list.slice(-100)));
  } catch {
    /* ignore */
  }
}

function recordConflict(c: SyncConflict) {
  const list = loadConflicts().filter((x) => !(x.module === c.module && x.id === c.id));
  list.push(c);
  saveConflicts(list);
}

export function conflictCount(): number {
  return loadConflicts().length;
}

export function dismissConflict(module: string, id: string): void {
  saveConflicts(loadConflicts().filter((c) => !(c.module === module && c.id === id)));
}

/** Resolve a conflict the way the user chose. Nothing is ever auto-decided. */
export async function resolveConflict(
  module: string,
  id: string,
  choice: 'local' | 'server'
): Promise<boolean> {
  const c = loadConflicts().find((x) => x.module === module && x.id === id);
  if (!c) return false;
  const st = useData.getState();

  if (choice === 'server') {
    const data: any = c.serverData ?? {};
    setBaseline(module, id, data);
    await st.save(module as ModuleType, { ...data, id, updatedAt: c.serverUpdatedAt } as any, { fromSync: true });
    // Drop our competing pending op so we don't immediately re-push it.
    savePending(loadPending().filter((p) => !(p.module === module && p.id === id)));
  } else {
    // Keep local and make sure it is (re)queued so the cloud converges to it.
    const local: any = st.getById(module as ModuleType, id);
    if (local) {
      enqueue({ op: 'upsert', module: module as ModuleType, id, data: local, createdAt: local.createdAt, updatedAt: Date.now() });
    }
  }
  dismissConflict(module, id);
  return true;
}

/** Fields that are metadata, not user content — never treated as a conflict. */
const IGNORED_FIELDS = new Set(['updatedAt', 'createdAt', 'id', 'version', 'deviceId']);

function titleFor(rec: any): string {
  return rec?.title ?? rec?.name ?? rec?.ward ?? rec?.question ?? 'Untitled record';
}

/** Ops sent in the current push, kept for the duration of one merge pass. */
let inFlightOps: PendingOp[] | null = null;

/**
 * BASELINE STORE.
 *
 * Three-way merge needs a common ancestor: the version both devices started
 * from. The pending queue holds the ALREADY-EDITED record, so it cannot serve
 * as one — using it made every real clash look like a safe merge.
 *
 * We therefore remember the last version we know the server had, per record,
 * and diff against that.
 */
const BASELINE_KEY = 'clinical-rx:sync-baseline';

function loadBaselines(): Record<string, any> {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveBaselines(map: Record<string, any>) {
  try {
    // Bound the size: keep the most recent 3000 baselines.
    const entries = Object.entries(map);
    const trimmed = entries.length > 3000 ? Object.fromEntries(entries.slice(-3000)) : map;
    localStorage.setItem(BASELINE_KEY, JSON.stringify(trimmed));
  } catch {
    /* baselines are an optimisation; never break a sync over them */
  }
}

/** Record the version the server is known to hold. */
export function setBaseline(module: string, id: string, data: unknown): void {
  const map = loadBaselines();
  map[`${module}:${id}`] = data;
  saveBaselines(map);
}

function getBaseline(module: string, id: string): any {
  return loadBaselines()[`${module}:${id}`];
}

export function clearBaseline(module: string, id: string): void {
  const map = loadBaselines();
  delete map[`${module}:${id}`];
  saveBaselines(map);
}

function pendingUpsertFor(module: string, id: string): PendingOp | undefined {
  const source = inFlightOps ?? loadPending();
  return source.find((p) => p.module === module && p.id === id && p.op === 'upsert');
}

/**
 * Compare a local and server record field by field.
 *
 * If each side touched DIFFERENT fields the change is safely mergeable.
 * If both changed the SAME field to different values, it is a real conflict
 * and must be shown to the user (§22).
 */
function describeConflict(
  module: string,
  local: any,
  server: { data: unknown; updatedAt: number }
): { kind: 'field-merge'; merged: any; fields: string[] } | { kind: 'conflict'; fields: string[] } {
  const remote: any = server.data ?? {};
  // The common ancestor: the last version we know the server had.
  const base = getBaseline(module, local.id);
  const keys = new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]);
  const clashing: string[] = [];
  const merged: any = { ...local };

  for (const k of keys) {
    if (IGNORED_FIELDS.has(k)) continue;
    const lv = JSON.stringify(local?.[k]);
    const rv = JSON.stringify(remote?.[k]);
    if (lv === rv) continue;

    // Without a common ancestor we cannot prove who changed what, so treat
    // any difference as a clash — the safe default.
    if (!base) {
      clashing.push(k);
      continue;
    }
    const bv = JSON.stringify(base?.[k]);
    const localChanged = lv !== bv;
    const remoteChanged = rv !== bv;

    if (localChanged && remoteChanged) clashing.push(k);
    else if (remoteChanged) merged[k] = remote[k]; // only the server moved
    // else only we moved — keep ours
  }

  return clashing.length ? { kind: 'conflict', fields: clashing } : { kind: 'field-merge', merged, fields: [] };
}

// ---- Merge helpers ----
function applyServerRecords(records: SyncRecord[], sentOps?: PendingOp[]) {
  // Conflict detection compares the server copy against the local edit we
  // were trying to push. The queue is cleared right after a successful push,
  // so the ops are passed in explicitly rather than re-read from storage.
  inFlightOps = sentOps ?? null;
  const st = useData.getState();
  const byKey = new Map(records.map((r) => [`${r.module}:${r.id}`, r]));

  const modules = activeSyncModules();

  const tasks: Promise<void>[] = [];
  for (const m of modules) {
    for (const local of st.all(m)) {
      const key = `${m}:${local.id}`;
      const server = byKey.get(key);
      if (!server) continue;
      if (server.deleted) {
        // Server says the record is deleted. Remove locally without
        // re-enqueueing a delete (it's already deleted server-side).
        clearTombstone(m, local.id);
        tasks.push(st.remove(m, local.id, { fromSync: true }));
        byKey.delete(key);
        continue;
      }
      if (server.updatedAt > local.updatedAt) {
        // CONFLICT CHECK (§21): the server is newer, but do we also have an
        // un-pushed local edit to the same record? If so this is a genuine
        // two-device conflict — record it for the user instead of silently
        // discarding their work.
        const localPending = pendingUpsertFor(m, local.id);
        if (localPending) {
          const conflict = describeConflict(m, local, server);
          if (conflict.kind === 'field-merge') {
            // Different fields changed on each side — safe to merge (§22).
            setBaseline(m, local.id, server.data);
            tasks.push(
              st.save(m, { ...conflict.merged, updatedAt: server.updatedAt, createdAt: server.createdAt }, { fromSync: true })
            );
          } else {
            // Same field changed differently — never overwrite. Keep the
            // local copy and surface the conflict for an explicit decision.
            recordConflict({
              module: m,
              id: local.id,
              title: titleFor(local),
              localUpdatedAt: local.updatedAt,
              serverUpdatedAt: server.updatedAt,
              fields: conflict.fields,
              localData: local,
              serverData: server.data,
              detectedAt: Date.now(),
            });
          }
          byKey.delete(key);
          continue;
        }
        // No competing local edit: adopt the server copy verbatim.
        setBaseline(m, local.id, server.data);
        tasks.push(st.save(m, { ...local, ...(server.data as any), updatedAt: server.updatedAt, createdAt: server.createdAt }, { fromSync: true }));
        byKey.delete(key);
      } else {
        // Local is newer or equal: keep local; drop the server copy so the
        // "not present locally" pass below cannot overwrite our newer data.
        // The server has accepted our version, so it becomes the baseline.
        setBaseline(m, local.id, server.data);
        byKey.delete(key);
      }
    }
    // Add records present on server but not locally.
    for (const [key, rec] of Array.from(byKey.entries())) {
      if (!key.startsWith(m + ':')) continue;
      if (rec.deleted) continue;
      // TOMBSTONE GUARD (§25): never resurrect something this device deleted.
      if (isTombstoned(m, rec.id, rec.updatedAt)) {
        byKey.delete(key);
        continue;
      }
      setBaseline(m, rec.id, rec.data);
      tasks.push(st.save(m, { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt, ...(rec.data as any) } as any, { fromSync: true }));
      byKey.delete(key);
    }
  }
  return Promise.all(tasks).then((r) => {
    inFlightOps = null;
    return r;
  });
}

export interface SyncOutcome {
  ok: boolean;
  pushed: number;
  pulled: number;
  message?: string;
}

/** Push pending changes, then pull the canonical set and apply it locally. */
export async function syncNow(): Promise<SyncOutcome> {
  const token = settingsToken();
  if (!token) return { ok: false, pushed: 0, pulled: 0, message: 'No online account connected.' };
  const st = useData.getState();

  // AI conversations only leave the device when the user opted in (§35).
  const allowed = new Set<string>(activeSyncModules());
  const pending = loadPending().filter((p) => allowed.has(p.module));
  const upserts = pending.filter((p) => p.op === 'upsert').map((p) => ({
    module: p.module,
    id: p.id,
    data: p.data ?? {},
    createdAt: p.createdAt ?? Date.now(),
    updatedAt: p.updatedAt ?? Date.now(),
  })) as SyncRecord[];
  const deletes = pending
    .filter((p) => p.op === 'delete')
    .map((p) => ({ module: p.module, id: p.id, data: {}, createdAt: Date.now(), updatedAt: Date.now(), deleted: true })) as SyncRecord[];

  const toSend = [...upserts, ...deletes];

  // If nothing pending, still pull incrementally (to get changes from other
  // devices since the last sync — keeps Redis command usage low).
  if (toSend.length === 0) {
    const lastSynced = useData.getState().settings?.onlineAccount?.lastSynced;
    const since = typeof lastSynced === 'number' ? lastSynced : undefined;
    const pull = await syncClient.pull(backendUrl(), token, since);
    if (!pull.ok) return { ok: false, pushed: 0, pulled: 0, message: pull.error };
    await applyServerRecords(pull.data.records);
    await touchLastSynced();
    return { ok: true, pushed: 0, pulled: pull.data.records.length };
  }

  const push = await syncClient.push(backendUrl(), token, toSend);
  if (!push.ok) return { ok: false, pushed: 0, pulled: 0, message: push.error };

  // Merge FIRST (so conflict detection can still see what we sent), then
  // clear only what we actually sent — anything filtered out (e.g. AI chats
  // while the opt-in is off) must stay queued for later.
  await applyServerRecords(push.data.records, pending);
  savePending(loadPending().filter((p) => !allowed.has(p.module)));
  await touchLastSynced();
  return { ok: true, pushed: toSend.length, pulled: push.data.records.length };
}

/** Full sync (manual button / "be sure"): pushes pending then pulls everything. */
export async function syncNowFull(): Promise<SyncOutcome> {
  const token = settingsToken();
  if (!token) return { ok: false, pushed: 0, pulled: 0, message: 'No online account connected.' };
  const st = useData.getState();

  const allowed = new Set<string>(activeSyncModules());
  const pending = loadPending().filter((p) => allowed.has(p.module));
  const upserts = pending.filter((p) => p.op === 'upsert').map((p) => ({
    module: p.module, id: p.id, data: p.data ?? {}, createdAt: p.createdAt ?? Date.now(), updatedAt: p.updatedAt ?? Date.now(),
  })) as SyncRecord[];
  const deletes = pending.filter((p) => p.op === 'delete')
    .map((p) => ({ module: p.module, id: p.id, data: {}, createdAt: Date.now(), updatedAt: Date.now(), deleted: true })) as SyncRecord[];
  const toSend = [...upserts, ...deletes];

  // Always do a full pull after pushing, to be certain all devices match.
  if (toSend.length === 0) {
    const pull = await syncClient.pull(backendUrl(), token);
    if (!pull.ok) return { ok: false, pushed: 0, pulled: 0, message: pull.error };
    await applyServerRecords(pull.data.records);
    await touchLastSynced();
    return { ok: true, pushed: 0, pulled: pull.data.records.length };
  }

  const push = await syncClient.push(backendUrl(), token, toSend);
  if (!push.ok) return { ok: false, pushed: 0, pulled: 0, message: push.error };
  const sent = pending;
  savePending(loadPending().filter((p) => !allowed.has(p.module)));
  const pull = await syncClient.pull(backendUrl(), token);
  if (!pull.ok) return { ok: false, pushed: toSend.length, pulled: 0, message: pull.error };
  await applyServerRecords(pull.data.records, sent);
  await touchLastSynced();
  return { ok: true, pushed: toSend.length, pulled: pull.data.records.length };
}

/** Called right after a successful login: pulls the latest from the cloud. */
export async function autoSyncOnLogin(): Promise<SyncOutcome> {
  const outcome = await syncNow();
  // Also sync the cloud AI config so multiple devices share the same AI setup
  // (API keys included). Pulls cloud -> local, or seeds cloud if it's empty.
  const { syncAiConfig } = await import('./aiConfigSync');
  try { await syncAiConfig(); } catch { /* non-fatal */ }
  return outcome;
}

async function touchLastSynced() {
  const st = useData.getState();
  const settings = st.settings;
  if (!settings) return;
  await st.saveSettings({
    ...settings,
    updatedAt: Date.now(),
    onlineAccount: { ...settings.onlineAccount, lastSynced: Date.now(), syncing: false },
  });
}
