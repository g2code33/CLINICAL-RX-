import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { syncClient } from '../services/syncClient';
import { useData } from '../stores/data';

export function ResetPassword() {
  const navigate = useNavigate();
  const setStatus = useData((s) => s.setStatus);
  const backendUrl = useData((s) => s.settings?.onlineAccount?.backendUrl ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Read token from the hash, e.g. #/reset?token=abc
  const token = new URLSearchParams(window.location.hash.split('?')[1] || '').get('token') || '';

  async function submit() {
    if (!password) return;
    setBusy(true);
    setMsg('');
    const res = await syncClient.reset(backendUrl, { method: 'token', token, password });
    setMsg(res.data?.message || res.error || 'Reset failed.');
    setBusy(false);
    if (res.ok) setStatus('✓ Password reset — you can now sign in.');
  }

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="card max-w-md text-center">
          <h2 className="mb-2 text-lg font-bold">Invalid reset link</h2>
          <p className="text-sm text-slate-400">This link is missing a reset token. Request a new one from Settings → Forgot password.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h2 className="mb-1 text-lg font-bold">Set a new password</h2>
        <p className="mb-4 text-sm text-slate-400">Enter a new password for your CLINICAL Rx account.</p>
        <div className="space-y-3">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (at least 6 chars)" />
          <button className="btn-primary w-full" disabled={busy || password.length < 6} onClick={submit}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
          {msg && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{msg}</div>}
          {msg && !busy && (
            <button className="btn-secondary w-full" onClick={() => navigate('/settings')}>Go to Settings →</button>
          )}
        </div>
      </div>
    </div>
  );
}
