import { useEffect, useState } from 'react';
import { hasElectronBridge } from '../db/adapter';

type Phase =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version?: string }
  | { state: 'up-to-date'; version?: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version?: string }
  | { state: 'error'; message: string };

export function UpdatePanel() {
  const [meta, setMeta] = useState<{ appVersion: string; enabled: boolean; owner: string; repo: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: 'idle' });
  const isElectron = hasElectronBridge();

  useEffect(() => {
    if (!isElectron) return;
    window.clinicalRx!.update.getVersion().then(setMeta);
    const off = window.clinicalRx!.update.onStatus((s: any) => {
      if (s?.state) setPhase(s);
    });
    return off;
  }, [isElectron]);

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

  async function check() {
    setPhase({ state: 'checking' });
    const res = await window.clinicalRx!.update.check();
    if (!res.ok && res.reason === 'dev') {
      setPhase({ state: 'error', message: 'Dev mode: updates are only available in packaged builds.' });
    } else if (!res.ok) {
      setPhase({ state: 'error', message: res.message || 'Check failed. Make sure you are connected to the internet.' });
    }
  }
  async function download() {
    setPhase({ state: 'downloading', percent: 0 });
    await window.clinicalRx!.update.download();
  }
  async function install() {
    await window.clinicalRx!.update.install();
  }

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

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={check} disabled={phase.state === 'checking' || phase.state === 'downloading'}>
          {phase.state === 'checking' ? 'Checking…' : '🔎 Check for updates'}
        </button>
        {(phase.state === 'available' || phase.state === 'error') && (
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
