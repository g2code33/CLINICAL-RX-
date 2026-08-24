import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { Modal } from '../components/Modal';
import { useData } from '../stores/data';
import {
  accountState,
  deviceInfo,
  renameDevice,
  signOut,
} from '../services/authService';
import {
  executeLink,
  formatBytes,
  firstSyncApproved,
  localInventory,
  planLink,
  type LinkChoice,
  type LinkPlan,
} from '../services/accountLink';
import { runSync, syncStatus } from '../services/syncScheduler';
import {
  SYNC_CATEGORIES,
  dismissConflict,
  loadConflicts,
  resolveConflict,
  type SyncConflict,
} from '../services/syncEngine';
import {
  buildDataExport,
  createCloudBackup,
  deleteCloudBackup,
  listCloudBackups,
  previewRestore,
  restoreCloudBackup,
  type BackupManifest,
} from '../services/cloudBackup';
import { downloadBackup } from '../services/backup';
import { downloadText } from '../services/export';

/**
 * ☁️ SYNC CENTER (Phase 7 §48)
 *
 * One screen for everything cloud: account, connection, pending work,
 * conflicts, backups and devices.
 *
 * The whole screen is designed to be ignorable — the app works perfectly with
 * no account at all, and this page says so rather than nagging.
 */

function fmtTime(ts?: number): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

export default function SyncCenter() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => syncStatus(), [settings, tick]);
  const account = useMemo(() => accountState(), [settings, tick]);
  const device = useMemo(() => deviceInfo(), [settings, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const conflicts = useMemo(() => loadConflicts(), [tick, settings]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inventory = useMemo(() => localInventory(), [tick, settings]);

  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState<LinkPlan | null>(null);
  const [backups, setBackups] = useState<BackupManifest[] | null>(null);
  const [restoring, setRestoring] = useState<BackupManifest | null>(null);

  // Refresh the indicator periodically so "2 minutes ago" stays honest.
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, []);

  const doSync = async () => {
    setBusy('sync');
    setMessage('');
    const res = await runSync(true);
    setBusy('');
    setMessage(res.message);
    refresh();
  };

  const loadBackups = async () => {
    setBusy('backups');
    const res = await listCloudBackups();
    setBusy('');
    if (res.ok) setBackups(res.backups);
    else setMessage(res.error ?? 'Could not load backups.');
  };

  const doBackup = async () => {
    setBusy('backup');
    setMessage('');
    const res = await createCloudBackup({ label: 'Manual backup' });
    setBusy('');
    setMessage(res.ok ? `☁️ Backup created — ${res.manifest?.recordCount} records.` : `⚠️ ${res.error}`);
    if (res.ok) void loadBackups();
  };

  const openPlan = async () => {
    setBusy('plan');
    const p = await planLink();
    setBusy('');
    setPlan(p);
  };

  const runLink = async (choice: LinkChoice) => {
    setBusy('link');
    const res = await executeLink(choice);
    setBusy('');
    setPlan(null);
    setMessage(res.message);
    refresh();
  };

  const doSignOut = async () => {
    const ok = window.confirm(
      'Sign out?\n\nYour local data will REMAIN on this device — nothing is deleted. You can keep working offline and sign in again any time.'
    );
    if (!ok) return;
    await signOut();
    setMessage('Signed out. All your local data is still here.');
    refresh();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="☁️ Sync Center"
        subtitle="Accounts and cloud sync are optional — CLINICAL Rx works fully offline without them."
        action={
          <button className="btn-secondary" onClick={() => navigate('/settings')}>
            ← Settings
          </button>
        }
      />

      {message && <div className="card text-sm">{message}</div>}

      {/* ---- STATUS ---- */}
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">
              {status.icon} {status.label}
            </div>
            <div className="text-sm opacity-80">{status.detail}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {account.signedIn && (
              <button className="btn-primary" disabled={!!busy} onClick={() => void doSync()}>
                {busy === 'sync' ? 'Syncing…' : '🔄 Sync Now'}
              </button>
            )}
            {!account.signedIn && (
              <button className="btn-primary" onClick={() => navigate('/auth')}>
                Sign In
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-2 border-t border-slate-200 pt-2 text-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
          <div>
            <div className="text-xs opacity-70">Account</div>
            <div>{account.signedIn ? account.email ?? 'Signed in' : 'Offline account'}</div>
          </div>
          <div>
            <div className="text-xs opacity-70">Internet</div>
            <div>{account.online ? '🟢 Online' : '📴 Offline'}</div>
          </div>
          <div>
            <div className="text-xs opacity-70">Last sync</div>
            <div>{fmtTime(status.lastSynced)}</div>
          </div>
          <div>
            <div className="text-xs opacity-70">Pending changes</div>
            <div>{status.pending}</div>
          </div>
        </div>

        {account.offlineSession && (
          <p className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-700">
            You are signed in but offline. Everything keeps working; changes will sync when you reconnect.
          </p>
        )}
      </div>

      {/* ---- OFFLINE ACCOUNT EXPLAINER ---- */}
      {!account.signedIn && (
        <div className="card space-y-2">
          <h2 className="font-semibold">📴 You are using an offline account</h2>
          <p className="text-sm opacity-80">
            Your data is stored locally on this device. Everything works — learning, ward rounds, bundles, search, your
            PharmD Journey and Local AI. An account only adds sync across devices and cloud backup.
          </p>
          <div className="rounded bg-slate-100 p-2 text-sm dark:bg-slate-700">
            <strong>{inventory.total}</strong> local record{inventory.total === 1 ? '' : 's'} on this device
            {inventory.approxBytes ? ` · about ${formatBytes(inventory.approxBytes)}` : ''}.
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => navigate('/auth')}>
              ☁️ Sign in to sync across devices
            </button>
            <button className="btn-secondary" onClick={() => downloadBackup()}>
              💾 Download a local backup
            </button>
          </div>
        </div>
      )}

      {/* ---- FIRST SYNC CONSENT ---- */}
      {account.signedIn && !firstSyncApproved() && (
        <div className="card space-y-2 border-amber-400/40 bg-amber-400/5">
          <h2 className="font-semibold">🔗 Link this device to your account</h2>
          <p className="text-sm">
            Nothing has been uploaded yet. Choose what should happen to the <strong>{inventory.total}</strong> record
            {inventory.total === 1 ? '' : 's'} on this device.
          </p>
          <button className="btn-primary" disabled={!!busy} onClick={() => void openPlan()}>
            {busy === 'plan' ? 'Checking your account…' : 'Review and choose'}
          </button>
        </div>
      )}

      {/* ---- CONFLICTS ---- */}
      {conflicts.length > 0 && (
        <div className="card space-y-3 border-red-400/40 bg-red-400/5">
          <h2 className="font-semibold">⚠️ {conflicts.length} record{conflicts.length === 1 ? '' : 's'} changed on two devices</h2>
          <p className="text-xs opacity-80">
            Nothing has been overwritten. Both versions are safe until you choose.
          </p>
          {conflicts.map((c) => (
            <ConflictCard key={`${c.module}:${c.id}`} conflict={c} onResolved={refresh} />
          ))}
        </div>
      )}

      {/* ---- WHAT SYNCS ---- */}
      {account.signedIn && (
        <div className="card space-y-2">
          <h2 className="font-semibold">📦 What syncs</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {SYNC_CATEGORIES.filter((c) => c.key !== 'ai').map((c) => (
              <li key={c.key}>✓ {c.label}</li>
            ))}
          </ul>
          <label className="mt-2 flex items-start gap-2 border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings?.onlineAccount?.syncAiConversations === true}
              onChange={async (e) => {
                const s = useData.getState().settings;
                if (!s) return;
                await useData.getState().saveSettings({
                  ...s,
                  updatedAt: Date.now(),
                  onlineAccount: { ...s.onlineAccount, syncAiConversations: e.target.checked },
                });
                refresh();
              }}
            />
            <span>
              Sync AI conversations
              <span className="block text-xs opacity-70">
                Off by default for privacy. Your chats stay on this device unless you turn this on.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings?.onlineAccount?.autoSync !== false}
              onChange={async (e) => {
                const s = useData.getState().settings;
                if (!s) return;
                await useData.getState().saveSettings({
                  ...s,
                  updatedAt: Date.now(),
                  onlineAccount: { ...s.onlineAccount, autoSync: e.target.checked },
                });
                refresh();
              }}
            />
            <span>
              Sync automatically in the background
              <span className="block text-xs opacity-70">Batched after a short idle period — never on every keystroke.</span>
            </span>
          </label>
          <p className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-700">
            🔐 Never synchronised: your AI API keys, your session token, and local AI model files. Those stay on this
            device.
          </p>
        </div>
      )}

      {/* ---- BACKUP ---- */}
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">💾 Backup</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => downloadBackup()}>
              Download local file
            </button>
            {account.signedIn && (
              <>
                <button className="btn-secondary" disabled={!!busy} onClick={() => void doBackup()}>
                  {busy === 'backup' ? 'Backing up…' : '☁️ Backup Now'}
                </button>
                <button className="btn-secondary" disabled={!!busy} onClick={() => void loadBackups()}>
                  {busy === 'backups' ? 'Loading…' : 'Backup history'}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-xs opacity-75">
          Sync keeps your devices consistent. Backup preserves recoverable snapshots you can return to.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-75">Automatic backup:</span>
          <select
            className="input"
            value={settings?.autoBackup ?? 'off'}
            onChange={async (e) => {
              const s = useData.getState().settings;
              if (!s) return;
              await useData.getState().saveSettings({ ...s, updatedAt: Date.now(), autoBackup: e.target.value as any });
              refresh();
            }}
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        {backups && (
          <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 dark:border-slate-700">
            {backups.length === 0 && <p className="text-sm opacity-70">No cloud backups yet.</p>}
            {backups.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {b.safety ? '🛟' : '☁️'} {fmtTime(b.createdAt)}
                  <span className="opacity-70">
                    {' '}
                    · {b.recordCount} records · {formatBytes(b.approxBytes)} · {b.deviceName}
                  </span>
                  {b.safety && <span className="ml-1 text-xs opacity-70">(safety copy)</span>}
                </span>
                <span className="flex gap-2">
                  <button className="underline" onClick={() => setRestoring(b)}>
                    Restore
                  </button>
                  <button
                    className="text-red-600 underline"
                    onClick={async () => {
                      if (!window.confirm('Delete this backup? This cannot be undone.')) return;
                      await deleteCloudBackup(b.id);
                      void loadBackups();
                    }}
                  >
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- DEVICE ---- */}
      <div className="card space-y-2">
        <h2 className="font-semibold">🖥 This device</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70">Name</div>
            <input
              className="input w-full"
              defaultValue={device.deviceName}
              onBlur={async (e) => {
                await renameDevice(e.target.value);
                refresh();
              }}
            />
          </div>
          <div>
            <div className="text-xs opacity-70">Platform</div>
            <div className="pt-2">{device.platform}</div>
          </div>
          <div>
            <div className="text-xs opacity-70">Last sync</div>
            <div className="pt-2">{fmtTime(device.lastSync)}</div>
          </div>
        </div>
        <p className="text-xs opacity-70">
          Device id <code>{device.deviceId.slice(0, 16)}…</code> — generated on this device and independent of your email.
        </p>
      </div>

      {/* ---- DATA & ACCOUNT ---- */}
      <div className="card space-y-2">
        <h2 className="font-semibold">📤 Your data</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              downloadText('clinical-rx-data-export.json', buildDataExport(), 'application/json');
              setMessage('Exported. The file contains no API keys or session tokens.');
            }}
          >
            Export all data (.json)
          </button>
          {account.signedIn && (
            <button className="btn-secondary" onClick={() => void doSignOut()}>
              Sign out
            </button>
          )}
        </div>
        <p className="text-xs opacity-70">
          Signing out never deletes local data. Exports exclude API keys, session tokens and local AI model files.
        </p>
      </div>

      {/* ---- MODALS ---- */}
      <LinkPlanModal plan={plan} inventory={inventory} busy={busy === 'link'} onClose={() => setPlan(null)} onChoose={runLink} />
      <RestoreModal
        manifest={restoring}
        onClose={() => setRestoring(null)}
        onDone={(msg) => {
          setRestoring(null);
          setMessage(msg);
          refresh();
        }}
      />
    </div>
  );
}

// ---- Conflict card -----------------------------------------------------

function ConflictCard({ conflict, onResolved }: { conflict: SyncConflict; onResolved: () => void }) {
  const [open, setOpen] = useState(false);
  const local: any = conflict.localData ?? {};
  const server: any = conflict.serverData ?? {};

  const choose = async (which: 'local' | 'server') => {
    await resolveConflict(conflict.module, conflict.id, which);
    onResolved();
  };

  return (
    <div className="rounded border border-slate-300 p-2 text-sm dark:border-slate-600">
      <div className="font-medium">
        {conflict.title} <span className="text-xs opacity-70">({conflict.module})</span>
      </div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded bg-slate-100 p-2 dark:bg-slate-700">
          <div className="font-medium">This device</div>
          <div className="opacity-70">{fmtTime(conflict.localUpdatedAt)}</div>
        </div>
        <div className="rounded bg-slate-100 p-2 dark:bg-slate-700">
          <div className="font-medium">Other device</div>
          <div className="opacity-70">{fmtTime(conflict.serverUpdatedAt)}</div>
        </div>
      </div>
      <p className="mt-1 text-xs opacity-75">
        Differing field{conflict.fields.length === 1 ? '' : 's'}: {conflict.fields.join(', ')}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => void choose('local')}>
          Keep This Device
        </button>
        <button className="btn-secondary" onClick={() => void choose('server')}>
          Keep Cloud Version
        </button>
        <button className="underline" onClick={() => setOpen(true)}>
          Review Both
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Compare — ${conflict.title}`} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {['local', 'server'].map((side) => {
            const data = side === 'local' ? local : server;
            return (
              <div key={side}>
                <h4 className="font-medium">{side === 'local' ? 'This device' : 'Cloud version'}</h4>
                <div className="mt-1 space-y-1 text-xs">
                  {conflict.fields.map((f) => (
                    <div key={f} className="rounded bg-slate-100 p-2 dark:bg-slate-700">
                      <div className="opacity-70">{f}</div>
                      <div className="whitespace-pre-wrap break-words">{String(data?.[f] ?? '—')}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void choose('local').then(() => setOpen(false))}>
            Keep This Device
          </button>
          <button className="btn-secondary" onClick={() => void choose('server').then(() => setOpen(false))}>
            Keep Cloud Version
          </button>
          <button
            className="underline"
            onClick={() => {
              dismissConflict(conflict.module, conflict.id);
              setOpen(false);
              onResolved();
            }}
          >
            Decide later
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ---- Link plan modal ---------------------------------------------------

const CHOICE_LABEL: Record<LinkChoice, { title: string; hint: string }> = {
  upload: { title: 'Back Up & Sync', hint: 'Upload this device’s data and keep everything in sync from now on.' },
  download: { title: 'Download to This Device', hint: 'Bring your account’s data down to this device.' },
  merge: { title: 'Merge Safely', hint: 'Keep BOTH sets of records. Nothing is deleted on either side.' },
  'local-only': { title: 'Keep Local Only', hint: 'Stay signed in but upload nothing. You can change this later.' },
};

function LinkPlanModal({
  plan,
  inventory,
  busy,
  onClose,
  onChoose,
}: {
  plan: LinkPlan | null;
  inventory: ReturnType<typeof localInventory>;
  busy: boolean;
  onClose: () => void;
  onChoose: (c: LinkChoice) => void;
}) {
  if (!plan) return null;
  return (
    <Modal open={!!plan} onClose={onClose} title="Ready to sync" wide>
      <div className="space-y-3 text-sm">
        <p>{plan.summary}</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded bg-slate-100 p-2 dark:bg-slate-700">
            <div className="text-xs opacity-70">This device</div>
            <div className="text-xl font-semibold">{plan.localTotal}</div>
            <div className="text-xs opacity-70">records · about {formatBytes(inventory.approxBytes)}</div>
          </div>
          <div className="rounded bg-slate-100 p-2 dark:bg-slate-700">
            <div className="text-xs opacity-70">Your account</div>
            <div className="text-xl font-semibold">{plan.cloudTotal}</div>
            <div className="text-xs opacity-70">records already in the cloud</div>
          </div>
        </div>

        {inventory.byCategory.length > 0 && (
          <details className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <summary className="cursor-pointer">What is on this device</summary>
            <ul className="mt-1 space-y-0.5">
              {inventory.byCategory.map((c) => (
                <li key={c.label} className="flex justify-between">
                  <span>{c.label}</span>
                  <strong>{c.count}</strong>
                </li>
              ))}
              <li className="flex justify-between border-t border-slate-200 pt-1 dark:border-slate-700">
                <span>AI conversations (not synced unless you opt in)</span>
                <strong>{inventory.aiConversations}</strong>
              </li>
            </ul>
          </details>
        )}

        <div className="space-y-2">
          {plan.options.map((opt) => (
            <button
              key={opt}
              className={`w-full rounded border p-2 text-left ${
                opt === plan.recommended ? 'border-brand-500 bg-brand-500/5' : 'border-slate-300 dark:border-slate-600'
              }`}
              disabled={busy}
              onClick={() => onChoose(opt)}
            >
              <div className="font-medium">
                {CHOICE_LABEL[opt].title}
                {opt === plan.recommended && <span className="ml-2 text-xs opacity-70">recommended</span>}
              </div>
              <div className="text-xs opacity-75">{CHOICE_LABEL[opt].hint}</div>
            </button>
          ))}
        </div>

        <button className="underline" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ---- Restore modal -----------------------------------------------------

function RestoreModal({
  manifest,
  onClose,
  onDone,
}: {
  manifest: BackupManifest | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewRestore>> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!manifest) {
      setPreview(null);
      return;
    }
    void previewRestore(manifest.id).then(setPreview);
  }, [manifest]);

  if (!manifest) return null;

  return (
    <Modal open={!!manifest} onClose={onClose} title="Restore backup" wide>
      <div className="space-y-3 text-sm">
        <div className="rounded border border-amber-400/40 bg-amber-400/10 p-2">
          <strong>Restoring brings back an earlier snapshot.</strong>
          <p className="mt-1 text-xs">
            A safety copy of your current data is taken automatically first, so this can be undone.
          </p>
        </div>

        <div>
          <div className="text-xs opacity-70">Backup date</div>
          <div>{fmtTime(manifest.createdAt)}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded bg-slate-100 p-2 dark:bg-slate-700">
            <div className="text-xs opacity-70">In this backup</div>
            <div className="text-xl font-semibold">{manifest.recordCount}</div>
          </div>
          <div className="rounded bg-slate-100 p-2 dark:bg-slate-700">
            <div className="text-xs opacity-70">On this device now</div>
            <div className="text-xl font-semibold">{preview?.currentTotal ?? '—'}</div>
          </div>
        </div>

        {preview?.groups?.length ? (
          <details className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <summary className="cursor-pointer">Review contents</summary>
            <ul className="mt-1 space-y-0.5">
              {preview.groups.map((g) => (
                <li key={g.module} className="flex justify-between">
                  <span>{g.module}</span>
                  <strong>{g.count}</strong>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <p className="text-xs opacity-75">
          Records created since this backup are left untouched — restoring adds the backup’s versions back rather than
          wiping your device.
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="underline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await restoreCloudBackup(manifest.id);
              setBusy(false);
              onDone(
                res.ok
                  ? `✓ Restored ${res.restored} records.${res.warning ? ` ⚠️ ${res.warning}` : ' A safety copy of your previous state was saved.'}`
                  : `⚠️ ${res.error}`
              );
            }}
          >
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
