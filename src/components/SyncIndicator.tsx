import { useData } from '../stores/data';
import { getPendingCount } from '../services/syncEngine';

export function SyncIndicator() {
  const connected = useData((s) => s.settings?.onlineAccount?.connected);
  const syncing = useData((s) => s.settings?.onlineAccount?.syncing);
  const pending = getPendingCount();

  if (!connected) return null;

  return (
    <button
      className="btn-ghost !py-1 text-sm"
      title={pending > 0 ? `${pending} change(s) waiting to sync` : 'Connected — all changes synced'}
      onClick={async () => {
        useData.getState().setStatus('Syncing…');
        const { syncNow } = await import('../services/syncEngine');
        const outcome = await syncNow();
        useData.getState().setStatus(outcome.ok ? `✓ Synced (+${outcome.pulled} pulled)` : '⚠️ Sync failed');
      }}
    >
      {syncing ? '☁️ Syncing…' : pending > 0 ? `☁️ ${pending} pending` : '☁️ Synced'}
    </button>
  );
}
