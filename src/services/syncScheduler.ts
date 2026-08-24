import { useData } from '../stores/data';
import { conflictCount, getPendingCount, syncNow } from './syncEngine';
import { firstSyncApproved } from './accountLink';
import { refreshSession } from './authService';
import { runCloudAutoBackup } from './cloudBackup';
import { audit } from './auditLog';

/**
 * ⏱️ SYNC SCHEDULER (Phase 7 §18, §46, §47)
 *
 * Decides WHEN to sync. Three rules shape everything here:
 *
 *  1. Never make the user wait. Writes land locally first; syncing is
 *     background work that can fail harmlessly.
 *  2. Never sync per keystroke. Edits are debounced into one request after a
 *     short idle period.
 *  3. Never hammer a failing server. Failures back off exponentially and stop
 *     after a limit, leaving manual retry available.
 */

const IDLE_DEBOUNCE_MS = 8_000; // quiet period before an automatic push
const POLL_MS = 5 * 60_000; // periodic catch-up while idle
const MAX_AUTO_FAILURES = 5; // then wait for a manual retry
const BASE_BACKOFF_MS = 30_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let started = false;

function account() {
  return useData.getState().settings?.onlineAccount;
}

function online(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Every precondition for an AUTOMATIC sync. Manual sync bypasses most of it. */
export function canAutoSync(): { ok: boolean; reason?: string } {
  const a = account();
  if (!a?.connected || !a.token) return { ok: false, reason: 'Not signed in.' };
  if (a.autoSync === false) return { ok: false, reason: 'Automatic sync is off.' };
  if (!firstSyncApproved()) return { ok: false, reason: 'Waiting for you to approve the first sync.' };
  if (!online()) return { ok: false, reason: 'Offline — changes are saved locally.' };
  if (conflictCount() > 0) return { ok: false, reason: 'Resolve the sync conflict first.' };
  if (a.retryAfter && Date.now() < a.retryAfter) {
    const secs = Math.ceil((a.retryAfter - Date.now()) / 1000);
    return { ok: false, reason: `Waiting ${secs}s before retrying.` };
  }
  if ((a.failureCount ?? 0) >= MAX_AUTO_FAILURES) {
    return { ok: false, reason: 'Automatic sync paused after repeated failures. Use Sync Now to retry.' };
  }
  return { ok: true };
}

async function patchAccount(patch: Record<string, unknown>) {
  const st = useData.getState();
  const settings = st.settings;
  if (!settings) return;
  await st.saveSettings({
    ...settings,
    updatedAt: Date.now(),
    onlineAccount: { ...settings.onlineAccount, ...patch },
  });
}

async function noteSuccess() {
  await patchAccount({ failureCount: 0, retryAfter: undefined, lastError: undefined });
}

/** Exponential backoff, capped, so a dead server never drains the battery. */
async function noteFailure(message?: string) {
  const a = account();
  const failures = (a?.failureCount ?? 0) + 1;
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), 15 * 60_000);
  await patchAccount({
    failureCount: failures,
    retryAfter: Date.now() + delay,
    lastError: message ?? 'Cloud sync is temporarily unavailable. Your changes are safely stored locally and will sync later.',
  });
}

/**
 * Run one sync pass. `manual` ignores the backoff and the auto-sync toggle,
 * because the user explicitly asked.
 */
export async function runSync(manual = false): Promise<{ ok: boolean; message: string }> {
  if (running) return { ok: false, message: 'A sync is already running.' };

  if (!manual) {
    const gate = canAutoSync();
    if (!gate.ok) return { ok: false, message: gate.reason ?? 'Sync unavailable.' };
  } else {
    const a = account();
    if (!a?.connected || !a.token) return { ok: false, message: 'Sign in to sync.' };
    if (!online()) return { ok: false, message: 'You are offline. Your changes are saved locally and will sync when you reconnect.' };
  }

  running = true;
  try {
    const res = await syncNow();
    if (res.ok) {
      await noteSuccess();
      const st = useData.getState();
      const settings = st.settings;
      if (settings?.device) {
        await st.saveSettings({
          ...settings,
          updatedAt: Date.now(),
          device: { ...settings.device, lastSync: Date.now(), lastSeen: Date.now() },
        });
      }
      audit('sync.completed', { count: res.pushed + res.pulled, ok: true });
      if (conflictCount() > 0) audit('sync.conflict', { count: conflictCount() });
      return { ok: true, message: `Synced — ${res.pushed} sent, ${res.pulled} received.` };
    }

    // A 401 means the cached session died; ask for a graceful re-login
    // rather than silently failing forever (§45).
    if (/401|unauth|invalid token|expired/i.test(res.message ?? '')) {
      const check = await refreshSession();
      if (check.needsReauth) {
        await patchAccount({ lastError: 'Your session expired. Sign in again to resume syncing.' });
        return { ok: false, message: 'Your session expired. Sign in again to resume syncing.' };
      }
    }
    await noteFailure(res.message);
    audit('sync.failed', { ok: false });
    return { ok: false, message: res.message ?? 'Sync failed. Your changes are safe locally.' };
  } catch (e: any) {
    await noteFailure(e?.message);
    return { ok: false, message: 'Cloud sync is temporarily unavailable. Your changes are safely stored locally and will sync later.' };
  } finally {
    running = false;
  }
}

/**
 * Signal that local data changed. Collapses a burst of edits into one sync
 * after the user stops typing.
 */
export function notifyLocalChange(): void {
  if (!started) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (getPendingCount() > 0) void runSync(false);
  }, IDLE_DEBOUNCE_MS);
}

/** Start background syncing. Safe to call more than once. */
export function startSyncScheduler(): void {
  if (started) return;
  started = true;

  const onOnline = () => {
    // Connectivity returned: clear the backoff and catch up (§63).
    void patchAccount({ retryAfter: undefined, failureCount: 0 }).then(() => {
      if (getPendingCount() > 0) void runSync(false);
    });
  };
  window.addEventListener('online', onOnline);

  pollTimer = setInterval(() => {
    if (getPendingCount() > 0) void runSync(false);
    void runCloudAutoBackup();
  }, POLL_MS);

  // One catch-up shortly after launch, once the store has settled.
  setTimeout(() => {
    if (getPendingCount() > 0) void runSync(false);
  }, 4_000);
}

export function stopSyncScheduler(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (debounceTimer) clearTimeout(debounceTimer);
  pollTimer = null;
  debounceTimer = null;
  started = false;
}

// ---- Status for the UI (§20) -------------------------------------------

export type SyncLight = 'synced' | 'pending' | 'error' | 'offline' | 'signed-out';

export interface SyncStatus {
  light: SyncLight;
  icon: string;
  label: string;
  detail: string;
  pending: number;
  conflicts: number;
  lastSynced?: number;
}

function ago(ts?: number): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} minute${Math.floor(s / 60) === 1 ? '' : 's'} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? '' : 's'} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? '' : 's'} ago`;
}

/** One place the whole UI reads sync state from. */
export function syncStatus(): SyncStatus {
  const a = account();
  const pending = getPendingCount();
  const conflicts = conflictCount();
  const lastSynced = a?.lastSynced;

  if (!a?.connected || !a.token) {
    return {
      light: 'signed-out',
      icon: '⚪',
      label: 'Offline account',
      detail: 'Your data is stored locally on this device.',
      pending,
      conflicts,
      lastSynced,
    };
  }
  if (!online()) {
    return {
      light: 'offline',
      icon: '📴',
      label: 'Offline',
      detail: pending ? `${pending} change${pending === 1 ? '' : 's'} saved locally — will sync later.` : 'Changes are saved locally.',
      pending,
      conflicts,
      lastSynced,
    };
  }
  if (conflicts > 0) {
    return {
      light: 'error',
      icon: '🔴',
      label: 'Needs your decision',
      detail: `${conflicts} record${conflicts === 1 ? '' : 's'} changed on two devices.`,
      pending,
      conflicts,
      lastSynced,
    };
  }
  if (a.lastError) {
    return { light: 'error', icon: '🔴', label: 'Sync error', detail: a.lastError, pending, conflicts, lastSynced };
  }
  if (pending > 0) {
    return {
      light: 'pending',
      icon: '🟡',
      label: 'Sync pending',
      detail: `${pending} change${pending === 1 ? '' : 's'} waiting to upload.`,
      pending,
      conflicts,
      lastSynced,
    };
  }
  return {
    light: 'synced',
    icon: '🟢',
    label: 'Synced',
    detail: `Last synced ${ago(lastSynced)}.`,
    pending,
    conflicts,
    lastSynced,
  };
}
