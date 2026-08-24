import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import { SYNCED_MODULES, aiSyncEnabled } from './syncEngine';
import { stripDeviceSecrets } from './aiConfigSync';
import { deviceInfo } from './authService';
import type { ModuleType } from '../types';

/**
 * ☁️ CLOUD BACKUP (Phase 7 §26–§30)
 *
 * Backup is NOT sync.
 *   SYNC   keeps devices consistent with the present.
 *   BACKUP preserves recoverable snapshots of the past.
 *
 * A backup is an immutable point-in-time copy stored as ordinary synced
 * records under a reserved module, so it inherits the backend's existing
 * per-user authorisation for free — a backup can never be read by another
 * account.
 *
 * Secrets are stripped before a backup is written, exactly as they are for
 * sync (§39): no API keys, no session token, no local model files.
 */

/** Reserved module used to store backup blobs. Never part of normal sync. */
const BACKUP_MODULE = 'backup' as ModuleType;

export interface BackupManifest {
  id: string;
  createdAt: number;
  deviceId: string;
  deviceName: string;
  recordCount: number;
  approxBytes: number;
  /** True when created automatically before a restore (§30). */
  safety?: boolean;
  label?: string;
}

export interface BackupPayload {
  manifest: BackupManifest;
  /** module -> records */
  data: Record<string, unknown[]>;
}

function nowId(): string {
  return `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Snapshot the local database.
 *
 * Bundles are copied verbatim (§59) — a bundle's frozen snapshot must survive
 * backup/restore byte-for-byte, never regenerated from current records.
 * Academic stamps ride along untouched (§60).
 */
export function buildCloudBackup(opts: { safety?: boolean; label?: string } = {}): BackupPayload {
  const st = useData.getState();
  const dev = deviceInfo();
  const data: Record<string, unknown[]> = {};
  let recordCount = 0;

  const modules: ModuleType[] = aiSyncEnabled() ? [...SYNCED_MODULES, 'chat' as ModuleType] : SYNCED_MODULES;
  for (const m of modules) {
    const list = st.all(m);
    if (!list.length) continue;
    data[m] = list;
    recordCount += list.length;
  }

  // Settings are included for convenience but WITHOUT secrets.
  const settings = st.settings;
  if (settings) {
    const { onlineAccount, ...rest } = settings as any;
    data['settings'] = [
      {
        ...rest,
        ai: stripDeviceSecrets(settings.ai),
        // Session token, backend URL and cloud identity are device state.
        onlineAccount: undefined,
      },
    ];
  }
  if (st.profile) data['profile'] = [st.profile];

  const approxBytes = JSON.stringify(data).length;
  return {
    manifest: {
      id: nowId(),
      createdAt: Date.now(),
      deviceId: dev.deviceId,
      deviceName: dev.deviceName,
      recordCount,
      approxBytes,
      safety: opts.safety,
      label: opts.label,
    },
    data,
  };
}

function account() {
  return useData.getState().settings?.onlineAccount;
}

export interface BackupResult {
  ok: boolean;
  manifest?: BackupManifest;
  error?: string;
}

/** Create a cloud backup. Requires an account and connectivity. */
export async function createCloudBackup(opts: { safety?: boolean; label?: string } = {}): Promise<BackupResult> {
  const a = account();
  if (!a?.connected || !a.token) {
    return { ok: false, error: 'Sign in to create a cloud backup. Local backups are always available in Settings.' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'You are offline. Your work is saved locally and you can back up when you reconnect.' };
  }

  const payload = buildCloudBackup(opts);
  const res = await syncClient.push(a.backendUrl, a.token, [
    {
      module: BACKUP_MODULE,
      id: payload.manifest.id,
      data: payload as unknown,
      createdAt: payload.manifest.createdAt,
      updatedAt: payload.manifest.createdAt,
    },
  ]);
  if (!res.ok) return { ok: false, error: res.error ?? 'Backup failed.' };
  return { ok: true, manifest: payload.manifest };
}

/** List backups stored in the cloud, newest first (§28). */
export async function listCloudBackups(): Promise<{ ok: boolean; backups: BackupManifest[]; error?: string }> {
  const a = account();
  if (!a?.connected || !a.token) return { ok: false, backups: [], error: 'Not signed in.' };
  const res = await syncClient.pull(a.backendUrl, a.token);
  if (!res.ok) return { ok: false, backups: [], error: res.error };

  const records = ((res.data as any)?.records ?? []) as Array<any>;
  const backups = records
    .filter((r) => r.module === BACKUP_MODULE && !r.deleted)
    .map((r) => (r.data as BackupPayload)?.manifest)
    .filter((m): m is BackupManifest => !!m?.id)
    .sort((x, y) => y.createdAt - x.createdAt);
  return { ok: true, backups };
}

async function fetchBackup(id: string): Promise<BackupPayload | null> {
  const a = account();
  if (!a?.token) return null;
  const res = await syncClient.pull(a.backendUrl, a.token);
  if (!res.ok) return null;
  const records = ((res.data as any)?.records ?? []) as Array<any>;
  const hit = records.find((r) => r.module === BACKUP_MODULE && r.id === id && !r.deleted);
  return (hit?.data as BackupPayload) ?? null;
}

export interface RestorePreview {
  ok: boolean;
  manifest?: BackupManifest;
  /** What the restore would bring back, per category. */
  groups: Array<{ module: string; count: number }>;
  currentTotal: number;
  error?: string;
}

/** Inspect a backup before restoring. Changes nothing (§29). */
export async function previewRestore(id: string): Promise<RestorePreview> {
  const payload = await fetchBackup(id);
  if (!payload) return { ok: false, groups: [], currentTotal: 0, error: 'Backup not found.' };
  const st = useData.getState();
  const currentTotal = SYNCED_MODULES.reduce((n, m) => n + st.all(m).length, 0);
  const groups = Object.entries(payload.data)
    .filter(([m]) => m !== 'settings' && m !== 'profile')
    .map(([module, list]) => ({ module, count: (list as unknown[]).length }))
    .sort((a, b) => b.count - a.count);
  return { ok: true, manifest: payload.manifest, groups, currentTotal };
}

export interface RestoreResult {
  ok: boolean;
  restored: number;
  safetyBackupId?: string;
  error?: string;
  warning?: string;
}

/**
 * Restore a backup.
 *
 * SAFETY (§30): a snapshot of the CURRENT state is taken first, so a restore
 * is always reversible. If that safety backup cannot be created the restore
 * still proceeds only when the caller passes `force`, and the result says so.
 *
 * The restore is ADDITIVE-BY-TIMESTAMP: records from the backup are written
 * through the normal store, and anything created since the backup is left
 * alone rather than deleted. This is deliberately not a destructive
 * "wipe and replace" — losing post-backup work is the worst possible outcome.
 */
export async function restoreCloudBackup(id: string, opts: { force?: boolean } = {}): Promise<RestoreResult> {
  const payload = await fetchBackup(id);
  if (!payload) return { ok: false, restored: 0, error: 'Backup not found.' };

  // 1. Safety backup of the current state.
  let safetyBackupId: string | undefined;
  let warning: string | undefined;
  const safety = await createCloudBackup({ safety: true, label: 'Automatic safety copy taken before a restore' });
  if (safety.ok) {
    safetyBackupId = safety.manifest?.id;
  } else if (!opts.force) {
    return {
      ok: false,
      restored: 0,
      error: `Could not create a safety backup first (${safety.error}). Restore cancelled to protect your current data.`,
    };
  } else {
    warning = 'Restored WITHOUT a safety backup — the previous state was not preserved in the cloud.';
  }

  // 2. Apply the backup through the normal store, marked fromSync so the
  //    restore does not re-queue every record as a fresh local change.
  const st = useData.getState();
  let restored = 0;
  for (const [module, list] of Object.entries(payload.data)) {
    if (module === 'settings' || module === 'profile') continue; // never clobber device/session state
    for (const rec of list as any[]) {
      if (!rec?.id) continue;
      try {
        await st.save(module as ModuleType, rec, { fromSync: true });
        restored++;
      } catch {
        /* skip a corrupt record rather than abort the whole restore */
      }
    }
  }

  return { ok: true, restored, safetyBackupId, warning };
}

/** Delete a cloud backup (§28). Uses the standard tombstone push. */
export async function deleteCloudBackup(id: string): Promise<{ ok: boolean; error?: string }> {
  const a = account();
  if (!a?.token) return { ok: false, error: 'Not signed in.' };
  const res = await syncClient.push(a.backendUrl, a.token, [
    { module: BACKUP_MODULE, id, data: {}, createdAt: Date.now(), updatedAt: Date.now(), deleted: true },
  ]);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// ---- Automatic backups (§27) -------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

/**
 * Run a scheduled cloud backup if one is due.
 *
 * Deliberately conservative: signed in, online, enabled, nothing pending, and
 * no unresolved conflict. Never interrupts active work.
 */
export async function runCloudAutoBackup(now = Date.now()): Promise<boolean> {
  const st = useData.getState();
  const settings = st.settings;
  const a = settings?.onlineAccount;
  const mode = settings?.autoBackup ?? 'off';
  if (mode === 'off' || !settings || !a?.connected || !a.token) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  const { getPendingCount, conflictCount } = await import('./syncEngine');
  if (getPendingCount() > 0 || conflictCount() > 0) return false;

  const period = mode === 'daily' ? DAY : 7 * DAY;
  if (now - (settings.lastAutoBackup ?? 0) < period) return false;

  const res = await createCloudBackup({ label: 'Automatic backup' });
  if (!res.ok) return false;
  await st.saveSettings({ ...st.settings!, updatedAt: now, lastAutoBackup: now });
  return true;
}

// ---- Cloud data export (§50) -------------------------------------------

/** A portable export of everything, with secrets removed. */
export function buildDataExport(): string {
  const payload = buildCloudBackup({ label: 'Data export' });
  return JSON.stringify(
    {
      app: 'clinical-rx',
      kind: 'data-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      note: 'Contains no API keys, session tokens or local AI model files.',
      ...payload,
    },
    null,
    2
  );
}
