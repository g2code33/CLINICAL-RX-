import { useEffect, useRef, useState } from 'react';
import { useUpdateState } from './UpdatePanel';
import { useData } from '../stores/data';

// Header update control. Always visible. On the desktop app it checks, downloads
// and installs from GitHub Releases. On the web it explains you're always up to
// date. Auto-checks once on startup (desktop) so an "update available" notice
// appears on its own.
export function UpdateBadge() {
  const { meta, phase, isElectron, installType, setPhase } = useUpdateState();
  const setStatus = useData((s) => s.setStatus);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isElectron) return;
    if (phase.state !== 'idle' && phase.state !== 'up-to-date') return;
    window.clinicalRx!.update.check().then((res: any) => {
      if (res?.ok) setStatus('✓ Update check complete');
      else if (res?.reason === 'dev') setStatus('Dev mode — updates available in packaged builds');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function check() {
    setPhase({ state: 'checking' });
    setStatus('🔎 Checking for updates…');
    const res = await window.clinicalRx!.update.check();
    if (res?.reason === 'dev') setStatus('Dev mode — updates available in packaged builds');
    else if (res && !res.ok) setStatus('⚠️ ' + (res.message || 'Check failed'));
  }
  async function download() {
    setPhase({ state: 'downloading', percent: 0 });
    setStatus('⬇ Downloading update…');
    const res = await window.clinicalRx!.update.download();
    if (!res.ok) setStatus('⚠️ ' + (res.message || 'Download failed.'));
  }
  async function install() {
    setStatus('🔄 Restarting & installing…');
    const res = await window.clinicalRx!.update.install();
    if (!res.ok) setStatus('⚠️ ' + (res.message || 'Install failed.'));
  }

  const downloading = phase.state === 'downloading';
  const pillCls = 'rounded-full px-2 py-0.5 text-[10px] font-semibold';
  let pill: React.ReactNode;
  if (downloading) pill = <span className={`${pillCls} bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200`}>⬇ {phase.percent}%</span>;
  else if (phase.state === 'available' || phase.state === 'downloaded') pill = <span className={`${pillCls} bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200`}>🔄 Update available</span>;
  else pill = <span className={`${pillCls} bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300`}>🔄 v{__APP_VERSION__}</span>;

  return (
    <div className="relative" ref={popRef}>
      <button
        className="btn-ghost !px-2 !py-1 text-sm"
        onClick={() => {
          setOpen((o) => !o);
          // Auto-trigger a check when opening on desktop if not already done.
          if (isElectron && (phase.state === 'idle' || phase.state === 'up-to-date')) check();
        }}
        title="Check for updates"
      >
        {pill}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 text-sm font-semibold">🔄 Updates</div>

          {!isElectron ? (
            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              You're on the <strong>web version</strong> — it's always up to date. The check/download/install update flow is available in the desktop app.
            </div>
          ) : (
            <>
              <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Installed v{meta?.appVersion ?? '?'} · from GitHub Releases of g2code33/CLINICAL-RX-
              </div>

              {phase.state === 'checking' && <div className="mb-2 text-xs text-slate-500">🔎 Checking for updates…</div>}
              {phase.state === 'available' && <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">🔄 Update available{phase.version ? ` v${phase.version}` : ''}</div>}
              {phase.state === 'up-to-date' && <div className="mb-2 text-xs text-green-600 dark:text-green-400">✓ No update available — you're up to date</div>}
              {phase.state === 'downloading' && <div className="mb-2 text-xs text-sky-600 dark:text-sky-400">⬇ Downloading… {phase.percent}%</div>}
              {phase.state === 'downloaded' && <div className="mb-2 text-xs text-green-600 dark:text-green-400">✓ Downloaded — ready to install</div>}
              {phase.state === 'error' && <div className="mb-2 text-xs text-red-600 dark:text-red-400">⚠️ {phase.message}</div>}

              <div className="flex flex-wrap gap-2">
                {phase.state === 'up-to-date' && <button className="btn-secondary w-full" onClick={check}>Check again</button>}
                {phase.state === 'available' && <button className="btn-primary w-full" onClick={download}>⬇ Download &amp; install</button>}
                {phase.state === 'downloading' && <button className="btn-secondary w-full" disabled>Downloading {phase.percent}%…</button>}
                {phase.state === 'downloaded' && <button className="btn-primary w-full" onClick={install}>🔄 Restart &amp; install now</button>}
                {phase.state === 'error' && <button className="btn-secondary w-full" onClick={check}>Try again</button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
