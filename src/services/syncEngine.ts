import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import type { ModuleType, PendingOp, SyncRecord } from '../types';

const PENDING_KEY = 'clinical-rx:sync-pending';

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

// ---- Merge helpers ----
function applyServerRecords(records: SyncRecord[]) {
  const st = useData.getState();
  const byKey = new Map(records.map((r) => [`${r.module}:${r.id}`, r]));

  const modules: ModuleType[] = ['day', 'disease', 'medicine', 'investigation', 'question', 'lesson', 'revision', 'bundle'];

  const tasks: Promise<void>[] = [];
  for (const m of modules) {
    for (const local of st.all(m)) {
      const server = byKey.get(`${m}:${local.id}`);
      if (!server) continue;
      if (server.deleted) {
        tasks.push(st.remove(m, local.id));
        byKey.delete(`${m}:${local.id}`);
        continue;
      }
      if (server.updatedAt >= local.updatedAt) {
        tasks.push(st.save(m, { ...local, ...(server.data as any), updatedAt: server.updatedAt, createdAt: server.createdAt }));
        byKey.delete(`${m}:${local.id}`);
      }
    }
    // Add records present on server but not locally.
    for (const [key, rec] of Array.from(byKey.entries())) {
      if (!key.startsWith(m + ':')) continue;
      if (rec.deleted) continue;
      tasks.push(st.save(m, { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt, ...(rec.data as any) } as any));
      byKey.delete(key);
    }
  }
  return Promise.all(tasks);
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

  const pending = loadPending();
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

  // If nothing pending, still pull (to get changes from other devices).
  if (toSend.length === 0) {
    const pull = await syncClient.pull(backendUrl(), token);
    if (!pull.ok) return { ok: false, pushed: 0, pulled: 0, message: pull.error };
    await applyServerRecords(pull.data.records);
    await touchLastSynced();
    return { ok: true, pushed: 0, pulled: pull.data.records.length };
  }

  const push = await syncClient.push(backendUrl(), token, toSend);
  if (!push.ok) return { ok: false, pushed: 0, pulled: 0, message: push.error };

  savePending([]); // clear only on success
  await applyServerRecords(push.data.records);
  await touchLastSynced();
  return { ok: true, pushed: toSend.length, pulled: push.data.records.length };
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
