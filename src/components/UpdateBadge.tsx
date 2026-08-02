import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdateState } from './UpdatePanel';
import { useData } from '../stores/data';

// Compact header control: shows the version + an "update available" notice and
// jumps to Settings (which hosts the full download/install panel). It also auto-
// checks for updates once on mount so the notice appears without clicking.
export function UpdateBadge() {
  const navigate = useNavigate();
  const { phase, isElectron } = useUpdateState();
  const setStatus = useData((s) => s.setStatus);

  // One-time auto-check on startup (desktop only).
  useEffect(() => {
    if (!isElectron) return;
    if (phase.state !== 'idle' && phase.state !== 'up-to-date') return;
    window.clinicalRx!.update.check().then((res: any) => {
      if (res?.ok) setStatus('✓ Update check complete');
      else if (res?.reason === 'dev') setStatus('Dev mode — updates available in packaged builds');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  const hasUpdate = phase.state === 'available' || phase.state === 'downloaded';
  const downloading = phase.state === 'downloading';

  return (
    <button
      className="btn-ghost !px-2 !py-1 text-sm"
      onClick={() => navigate('/settings')}
      title={isElectron ? 'Check for updates (opens Settings)' : 'Updates (web is always latest)'}
    >
      {downloading ? (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-200">
          ⬇ {phase.percent}%
        </span>
      ) : hasUpdate ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          🔄 Update available
        </span>
      ) : (
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
          v{__APP_VERSION__}
        </span>
      )}
    </button>
  );
}
