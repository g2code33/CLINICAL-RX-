import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { runSync, syncStatus } from '../services/syncScheduler';

/**
 * ☁️ SYNC INDICATOR (Phase 7 §20)
 *
 * 🟢 Synced · 🟡 Pending · 🔴 Error/conflict · 📴 Offline · ⚪ No account.
 *
 * Its main job is REASSURANCE: whatever the state, the user should be able to
 * tell at a glance that their work is safe.
 */
export function SyncIndicator() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  // Keep the relative timestamp and pending count honest.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    const onNet = () => setTick((n) => n + 1);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = (() => syncStatus())();
  void settings;
  void tick;

  // No account: a quiet, ignorable invitation — never a wall.
  if (status.light === 'signed-out') {
    return (
      <button
        className="btn-ghost !py-1 text-sm"
        onClick={() => navigate('/sync')}
        title="Your data is stored locally on this device. Sign in to sync across devices."
      >
        ☁️ Sign in to sync
      </button>
    );
  }

  const label =
    busy ? 'Syncing…'
    : status.light === 'offline' ? 'Offline'
    : status.light === 'error' ? (status.conflicts > 0 ? `${status.conflicts} to review` : 'Sync error')
    : status.light === 'pending' ? `${status.pending} pending`
    : 'Synced';

  return (
    <button
      className="btn-ghost !py-1 text-sm"
      title={`${status.label} — ${status.detail}`}
      onClick={async () => {
        // A conflict needs a decision, not another sync attempt.
        if (status.conflicts > 0) {
          navigate('/sync');
          return;
        }
        setBusy(true);
        const res = await runSync(true);
        setBusy(false);
        useData.getState().setStatus(res.message);
        setTick((n) => n + 1);
      }}
    >
      {busy ? '☁️' : status.icon} {label}
    </button>
  );
}
