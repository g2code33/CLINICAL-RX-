import { useEffect, useState } from 'react';
import { lockState, unlock, hasRecoveryQuestion, recoveryQuestion, recoverWithAnswer } from '../services/appLock';
import { audit } from '../services/auditLog';

/**
 * 🔒 LOCK SCREEN (Phase 8 §15, PIN recovery added later)
 *
 * Shown before any private data is rendered. Deliberately shows NOTHING about
 * the user's records — no counts, no titles, no recent activity — because a
 * lock screen that leaks a preview defeats its own purpose.
 *
 * If a security question is configured, a forgotten PIN can be reset here by
 * answering it. Recovery sets a NEW PIN; the old one is a one-way hash and is
 * never recoverable. Crucially, forgetting a PIN never costs the user their
 * records.
 */
export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(lockState());

  // Recovery flow
  const [recovering, setRecovering] = useState(false);
  const [answer, setAnswer] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const canRecover = hasRecoveryQuestion();
  const question = recoveryQuestion();

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

  const submitRecovery = async () => {
    if (busy) return;
    if (newPin !== confirmPin) {
      setError('The two PINs do not match.');
      return;
    }
    setBusy(true);
    setError('');
    const res = await recoverWithAnswer(answer, newPin);
    setBusy(false);
    if (res.ok) {
      audit('security.pin-recovered', { ok: true });
      setAnswer('');
      setNewPin('');
      setConfirmPin('');
      onUnlocked();
      return;
    }
    audit('security.pin-recovery-failed', { ok: false });
    setError(res.error ?? 'Recovery failed.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-800">
        <div className="text-4xl" aria-hidden="true">
          🔒
        </div>

        {!recovering ? (
          <>
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

            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            {state.lockedOut && state.lockedUntilMs && (
              <p className="mt-2 text-sm text-amber-600" role="alert">
                Too many attempts. Try again in{' '}
                {Math.max(1, Math.ceil((state.lockedUntilMs - Date.now()) / 60000))} minute(s).
              </p>
            )}

            <button
              className="btn-primary mt-4 w-full"
              disabled={!pin || busy || state.lockedOut}
              onClick={() => void submit()}
            >
              {busy ? 'Checking…' : 'Unlock'}
            </button>

            {canRecover ? (
              <button
                className="mt-3 text-sm underline opacity-80 hover:opacity-100 focus-ring"
                onClick={() => {
                  setRecovering(true);
                  setError('');
                }}
              >
                Forgot your PIN?
              </button>
            ) : (
              <p className="mt-4 text-xs opacity-60">
                No security question is set on this device. You can add one in Settings → Security once unlocked, so a
                forgotten PIN is recoverable next time.
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-semibold">Reset your PIN</h1>
            <p className="mt-1 text-sm opacity-75">Answer your security question to set a new PIN.</p>

            <div className="mt-4 rounded-lg bg-brand-50 p-3 text-left text-sm dark:bg-brand-900">
              <span className="font-semibold">Your question:</span>
              <div className="mt-1">{question}</div>
            </div>

            <label className="label mt-3 text-left" htmlFor="recovery-answer">
              Your answer
            </label>
            <input
              id="recovery-answer"
              autoFocus
              className="input w-full"
              value={answer}
              disabled={busy}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Capitalisation and punctuation don't matter"
            />

            <label className="label mt-3 text-left" htmlFor="recovery-new-pin">
              New PIN
            </label>
            <input
              id="recovery-new-pin"
              type="password"
              inputMode="numeric"
              className="input w-full text-center text-xl tracking-[0.4em]"
              value={newPin}
              disabled={busy}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            />

            <label className="label mt-3 text-left" htmlFor="recovery-confirm-pin">
              Confirm new PIN
            </label>
            <input
              id="recovery-confirm-pin"
              type="password"
              inputMode="numeric"
              className="input w-full text-center text-xl tracking-[0.4em]"
              value={confirmPin}
              disabled={busy}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRecovery();
              }}
            />

            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              className="btn-primary mt-4 w-full"
              disabled={busy || !answer.trim() || !newPin || !confirmPin}
              onClick={() => void submitRecovery()}
            >
              {busy ? 'Checking…' : 'Reset PIN and unlock'}
            </button>

            <button
              className="mt-3 text-sm underline opacity-80 hover:opacity-100 focus-ring"
              onClick={() => {
                setRecovering(false);
                setError('');
              }}
            >
              ← Back to PIN entry
            </button>
          </>
        )}

        <p className="mt-4 text-xs opacity-60">
          Your data stays on this device and is never deleted by a failed unlock or a forgotten PIN.
        </p>
      </div>
    </div>
  );
}
