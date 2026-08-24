import { useEffect, useState } from 'react';
import { lockState, unlock } from '../services/appLock';
import { audit } from '../services/auditLog';

/**
 * 🔒 LOCK SCREEN (Phase 8 §15)
 *
 * Shown before any private data is rendered. Deliberately shows NOTHING about
 * the user's records — no counts, no titles, no recent activity — because a
 * lock screen that leaks a preview defeats its own purpose.
 */
export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(lockState());

  useEffect(() => {
    const t = setInterval(() => setState(lockState()), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async () => {
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    const res = await unlock(pin);
    setBusy(false);
    setPin('');
    if (res.ok) {
      onUnlocked();
      return;
    }
    audit('security.unlock-failed', { ok: false });
    setError(res.error ?? 'Incorrect PIN.');
    setState(lockState());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-800">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-2 text-xl font-semibold">CLINICAL Rx is locked</h1>
        <p className="mt-1 text-sm opacity-75">Enter your PIN to continue.</p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          className="input mt-4 w-full text-center text-2xl tracking-[0.5em]"
          value={pin}
          disabled={state.lockedOut || busy}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          aria-label="PIN"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {state.lockedOut && state.lockedUntilMs && (
          <p className="mt-2 text-sm text-amber-600">
            Too many attempts. Try again in {Math.max(1, Math.ceil((state.lockedUntilMs - Date.now()) / 60000))} minute(s).
          </p>
        )}

        <button className="btn-primary mt-4 w-full" disabled={!pin || busy || state.lockedOut} onClick={() => void submit()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>

        <p className="mt-4 text-xs opacity-60">
          Your data stays on this device. If you forget your PIN, you can clear the app’s stored settings in your
          browser or reinstall the desktop app — your local database file is not deleted by that.
        </p>
      </div>
    </div>
  );
}
