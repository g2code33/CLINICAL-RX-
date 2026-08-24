import { useEffect, useState } from 'react';
import { hasElectronBridge } from '../db/adapter';
import { confirmAction } from './ui/globalConfirm';

export type Phase =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version?: string }
  | { state: 'up-to-date'; version?: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version?: string }
  | { state: 'error'; message: string };

// Hook that both the header indicator and the full Settings panel share, so
// they stay in sync and the header can show an "update available" notice.
export function useUpdateState() {
  const [meta, setMeta] = useState<{ appVersion: string; enabled: boolean; owner: string; repo: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: 'idle' });
  const isElectron = hasElectronBridge();

  const [installType, setInstallType] = useState<string>('nsis');

  useEffect(() => {
    if (!isElectron) return;
    window.clinicalRx!.update.getVersion().then(setMeta);
    window.clinicalRx!.installType?.().then((t) => setInstallType(t || 'nsis')).catch(() => {});
    // After a restart, confirm the installed version is current.
    window.clinicalRx!.update.getState().then((st) => {
      if (st?.appVersion && meta?.appVersion && st.appVersion === meta.appVersion) {
        setPhase({ state: 'up-to-date', version: st.appVersion });
      }
    }).catch(() => {});
    const off = window.clinicalRx!.update.onStatus((s: any) => {
      if (s?.state) setPhase(s);
    });
    return off;
  }, [isElectron]);

  return { meta, phase, isElectron, installType, setPhase };
}

export function UpdatePanel() {
  const { meta, phase, isElectron, installType, setPhase } = useUpdateState();

  async function check() {
    if (!window.clinicalRx) return;
    setPhase({ state: 'checking' });
    const res = await window.clinicalRx.update.check();
    if (!res.ok && res.reason === 'dev') {
      setPhase({ state: 'error', message: 'Dev mode: updates are only available in packaged builds.' });
    } else if (!res.ok) {
      setPhase({ state: 'error', message: res.message || 'Check failed. Make sure you are connected to the internet.' });
    }
  }
  async function download() {
    if (!window.clinicalRx) return;
    setPhase({ state: 'downloading', percent: 0 });
    const res = await window.clinicalRx.update.download();
    if (!res.ok) {
      setPhase({ state: 'error', message: res.message || 'Download failed. Check your connection and try again.' });
    }
  }
  /**
   * Install the downloaded update (§42, §43).
   *
   * A local safety backup is written first. An update replaces the running
   * application, and if anything goes wrong mid-upgrade the user must still
   * have a restorable copy of their records — §45: never sacrifice user data
   * for convenience. A backup failure does not block the update, but the user
   * is told so they can decide.
   */
  async function install() {
    try {
      const { buildBackup } = await import('../services/backup');
      const json = buildBackup();
      localStorage.setItem('clinical-rx:pre-update-backup', json);
      localStorage.setItem('clinical-rx:pre-update-backup-at', new Date().toISOString());
    } catch {
      const proceed = await confirmAction({
        title: 'Could not create a safety backup',
        message: 'The update can still be installed, but no local safety copy was made first.',
        note: 'You can cancel, download a backup from Settings → Data, and try again.',
        confirmLabel: 'Install anyway',
        destructive: true,
      });
      if (!proceed) return;
    }
    await window.clinicalRx?.update.install();
  }

  if (!isElectron) {
    return (
      <div className="card">
        <h2 className="mb-1 font-semibold">🔄 Updates</h2>
        <p className="text-sm text-slate-400">
          On the web version you're always on the latest build. Automatic updates are available in the desktop app.
        </p>
      </div>
    );
  }

  const isDeb = installType === 'deb';
  const btn = 'btn-secondary';
  return (
    <div className="card">
      <h2 className="mb-1 font-semibold">🔄 Updates</h2>
      <p className="mb-3 text-xs text-slate-400">
        Updates are delivered from <strong>GitHub Releases</strong> of{' '}
        <code className="text-brand-600 dark:text-brand-400">g2code33/CLINICAL-RX-</code>.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
          Installed v{meta?.appVersion ?? '?'}
        </span>
        {phase.state === 'available' && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Update available{phase.version ? ` v${phase.version}` : ''}
          </span>
        )}
        {phase.state === 'up-to-date' && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
            ✓ You're up to date
          </span>
        )}
        {phase.state === 'downloading' && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-200">
            Downloading… {phase.percent}%
          </span>
        )}
        {phase.state === 'downloaded' && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
            ✓ Downloaded — ready to install
          </span>
        )}
        {phase.state === 'error' && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-200">
            ⚠️ {phase.message}
          </span>
        )}
      </div>

      {isDeb && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          ℹ️ You installed the <strong>.deb</strong> package — Linux .deb installs don't support in-app auto-update.
          When a new version is available, download the new <code>.deb</code> from the release page and reinstall.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={check} disabled={phase.state === 'checking' || phase.state === 'downloading'}>
          {phase.state === 'checking' ? 'Checking…' : '🔎 Check for updates'}
        </button>
        {isDeb && (
          <button
            className="btn-primary"
            onClick={() => window.open('https://github.com/g2code33/CLINICAL-RX-/releases/latest', '_blank')}
          >
            ⬇ Download new version
          </button>
        )}
        {!isDeb && (phase.state === 'available' || phase.state === 'error') && (
          <button className="btn-primary" onClick={download}>⬇ Download update</button>
        )}
        {phase.state === 'downloading' && (
          <button className={btn} disabled>Downloading {phase.percent}%…</button>
        )}
        {phase.state === 'downloaded' && (
          <button className="btn-primary" onClick={install}>🔄 Restart &amp; install now</button>
        )}
      </div>
    </div>
  );
}
