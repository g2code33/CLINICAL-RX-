import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { getPendingCount } from '../services/syncEngine';

// A small, reusable card/button that appears on multiple pages so signing in to
// the cloud is always in reach — not only in Settings.
export function CloudSyncPrompt() {
  const navigate = useNavigate();
  const connected = useData((s) => s.settings?.onlineAccount?.connected);
  const pending = getPendingCount();

  if (connected) {
    return (
      <button
        className="btn-secondary !py-1 text-xs"
        onClick={async () => {
          useData.getState().setStatus('Syncing…');
          const { syncNow } = await import('../services/syncEngine');
          const outcome = await syncNow();
          useData.getState().setStatus(outcome.ok ? `✓ Synced (+${outcome.pulled} pulled)` : '⚠️ Sync failed');
        }}
      >
        {pending > 0 ? `☁️ Sync (${pending} pending)` : '☁️ Sync now'}
      </button>
    );
  }

  return (
    <button className="btn-secondary !py-1 text-xs" onClick={() => navigate('/auth')} title="Sign in to sync across devices">
      ☁️ Sign in to sync
    </button>
  );
}
