import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import { SYNCED_MODULES, activeSyncModules, loadPending, savePending, enqueue, syncNowFull } from './syncEngine';
import { loadConversations } from './aiConversations';
import type { ModuleType, SyncRecord } from '../types';

/**
 * 🔗 ACCOUNT LINKING (Phase 7 §12, §13, §56, §57, §58)
 *
 * The most dangerous moment in any sync system is the FIRST one: a user who
 * has worked offline for months signs in, and a naive implementation either
 * uploads nothing (leaving their work stranded) or downloads a fresh empty
 * account over the top of it.
 *
 * Nothing in this module acts on its own. Every function reports what WOULD
 * happen; the user picks, and only then does data move.
 */

// ---- Local inventory (§13) ---------------------------------------------

export interface LocalInventory {
  total: number;
  byCategory: Array<{ label: string; count: number }>;
  aiConversations: number;
  approxBytes: number;
}

function countOf(module: ModuleType): number {
  try {
    return useData.getState().all(module).length;
  } catch {
    return 0;
  }
}

/** What this device currently holds. Real counts, never estimates. */
export function localInventory(): LocalInventory {
  const st = useData.getState();
  const groups: Array<{ label: string; modules: ModuleType[] }> = [
    { label: 'Learning notes', modules: ['lesson'] },
    { label: 'Diseases', modules: ['disease'] },
    { label: 'Medicines', modules: ['medicine'] },
    { label: 'Investigations', modules: ['investigation'] },
    { label: 'Questions', modules: ['question'] },
    { label: 'Ward rounds', modules: ['wardRound', 'wardEntry'] },
    { label: 'Bundles', modules: ['bundle'] },
    { label: 'Clinical days', modules: ['day'] },
    { label: 'Revision', modules: ['revision', 'quiz'] },
    { label: 'Academic', modules: ['academicStage', 'academicPeriod', 'course'] },
    { label: 'Clinical experiences', modules: ['clinicalExperience'] },
    { label: 'Skills', modules: ['skill'] },
    { label: 'Projects', modules: ['project'] },
    { label: 'Research', modules: ['research'] },
    { label: 'Leadership', modules: ['leadership'] },
    { label: 'Achievements', modules: ['achievement'] },
    { label: 'Certifications', modules: ['certification'] },
    { label: 'Goals', modules: ['goal'] },
  ];

  const byCategory = groups
    .map((g) => ({ label: g.label, count: g.modules.reduce((n, m) => n + countOf(m), 0) }))
    .filter((g) => g.count > 0);

  const total = SYNCED_MODULES.reduce((n, m) => n + countOf(m), 0);

  // Approximate payload size from the records that would actually be sent.
  let approxBytes = 0;
  try {
    for (const m of SYNCED_MODULES) approxBytes += JSON.stringify(st.all(m)).length;
  } catch {
    approxBytes = 0;
  }

  return { total, byCategory, aiConversations: loadConversations().length, approxBytes };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---- Cloud inspection (§57) --------------------------------------------

export interface CloudInventory {
  ok: boolean;
  total: number;
  error?: string;
}

/** Look at what the account already holds, WITHOUT changing anything. */
export async function inspectCloud(): Promise<CloudInventory> {
  const a = useData.getState().settings?.onlineAccount;
  if (!a?.token) return { ok: false, total: 0, error: 'Not signed in.' };
  const res = await syncClient.pull(a.backendUrl, a.token);
  if (!res.ok) return { ok: false, total: 0, error: res.error };
  const records = (res.data as any)?.records ?? [];
  return { ok: true, total: records.filter((r: any) => !r.deleted).length };
}

// ---- The linking decision (§58) ----------------------------------------

export type LinkChoice = 'upload' | 'download' | 'merge' | 'local-only';

export interface LinkPlan {
  localTotal: number;
  cloudTotal: number;
  /** Which options make sense given what actually exists on each side. */
  options: LinkChoice[];
  /** Plain-language description of the situation. */
  summary: string;
  recommended: LinkChoice;
}

/**
 * Work out the safe options for linking this device to the account.
 * Purely advisory — it moves no data.
 */
export async function planLink(): Promise<LinkPlan> {
  const local = localInventory();
  const cloud = await inspectCloud();
  const localTotal = local.total;
  const cloudTotal = cloud.ok ? cloud.total : 0;

  // FIRST DEVICE (§56): nothing in the cloud yet.
  if (cloudTotal === 0) {
    return {
      localTotal,
      cloudTotal,
      options: ['upload', 'local-only'],
      summary: localTotal
        ? `This account has no data yet. Your ${localTotal} local record${localTotal === 1 ? '' : 's'} can become the starting point for your cloud copy.`
        : 'This account has no data yet, and neither does this device. Nothing to transfer.',
      recommended: 'upload',
    };
  }

  // SECOND DEVICE, empty locally (§57).
  if (localTotal === 0) {
    return {
      localTotal,
      cloudTotal,
      options: ['download', 'local-only'],
      summary: `Your account contains ${cloudTotal} record${cloudTotal === 1 ? '' : 's'}. This device is empty, so downloading is safe.`,
      recommended: 'download',
    };
  }

  // SECOND DEVICE WITH LOCAL DATA (§58) — the risky case. Merge is the only
  // option that cannot lose anything, so it is what we recommend.
  return {
    localTotal,
    cloudTotal,
    options: ['merge', 'download', 'local-only'],
    summary: `This device has ${localTotal} record${localTotal === 1 ? '' : 's'} and your account has ${cloudTotal}. Merging keeps both; nothing is deleted.`,
    recommended: 'merge',
  };
}

export interface LinkOutcome {
  ok: boolean;
  choice: LinkChoice;
  pushed: number;
  pulled: number;
  message: string;
}

/**
 * Execute a linking choice the user explicitly made.
 *
 * Note there is no "replace cloud with local" or "wipe local" path here:
 * every option is non-destructive by construction. The closest thing to a
 * replace is 'download', which still merges by timestamp rather than deleting.
 */
export async function executeLink(choice: LinkChoice): Promise<LinkOutcome> {
  const st = useData.getState();
  const settings = st.settings;
  const a = settings?.onlineAccount;
  if (!a?.token || !settings) {
    return { ok: false, choice, pushed: 0, pulled: 0, message: 'Not signed in.' };
  }

  if (choice === 'local-only') {
    // Stay signed in but never push. Nothing leaves the device.
    await st.saveSettings({
      ...settings,
      updatedAt: Date.now(),
      onlineAccount: { ...a, firstSyncApproved: false, autoSync: false },
    });
    return {
      ok: true,
      choice,
      pushed: 0,
      pulled: 0,
      message: 'Keeping this device local only. Nothing has been uploaded. You can start syncing any time from the Sync Center.',
    };
  }

  if (choice === 'upload' || choice === 'merge') {
    // Queue every local record so the first sync carries the full dataset.
    // (Records created before sign-in were never queued, because there was no
    // account to queue them for.)
    const allowed = new Set<string>(activeSyncModules());
    const pending = loadPending();
    const have = new Set(pending.map((p) => `${p.module}:${p.id}`));
    for (const m of activeSyncModules()) {
      if (!allowed.has(m)) continue;
      for (const rec of st.all(m) as any[]) {
        if (have.has(`${m}:${rec.id}`)) continue;
        pending.push({ op: 'upsert', module: m, id: rec.id, data: rec, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
      }
    }
    savePending(pending);
  }

  await st.saveSettings({
    ...settings,
    updatedAt: Date.now(),
    onlineAccount: { ...a, firstSyncApproved: true, autoSync: true },
  });

  // syncNowFull pushes then pulls, and its merge logic is timestamp-based, so
  // both 'download' and 'merge' converge without destroying either side.
  const res = await syncNowFull();
  return {
    ok: res.ok,
    choice,
    pushed: res.pushed,
    pulled: res.pulled,
    message: res.ok
      ? `Sync complete — ${res.pushed} uploaded, ${res.pulled} received.`
      : res.message ?? 'Sync failed. Your local data is untouched and will retry later.',
  };
}

/** Has the user approved uploading from this device? */
export function firstSyncApproved(): boolean {
  return useData.getState().settings?.onlineAccount?.firstSyncApproved === true;
}
