import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { syncClient } from '../services/syncClient';
import { autoSyncOnLogin } from '../services/syncEngine';

type Mode = 'signin' | 'signup';

export function AuthPage() {
  const navigate = useNavigate();
  const setStatus = useData((s) => s.setStatus);
  const persist = useData((s) => s.saveSettings);
  const [mode, setMode] = useState<Mode>('signin');
  const [form, setForm] = useState({ email: '', password: '', name: '', securityQuestion: '', securityAnswer: '', backendUrl: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const backendUrl = useData((s) => s.settings?.onlineAccount?.backendUrl ?? '');
  const effectiveUrl = form.backendUrl || backendUrl;

  async function submit() {
    setBusy(true);
    setMsg('');
    try {
      const res = mode === 'signin'
        ? await syncClient.login(effectiveUrl, form.email.trim(), form.password)
        : await syncClient.register(effectiveUrl, form.email.trim(), form.password, form.name.trim(), form.securityQuestion.trim() || undefined, form.securityAnswer.trim() || undefined);
      if (!res.ok) {
        setMsg('⚠️ ' + (res.error || 'Failed.'));
        return;
      }
      const acc = {
        connected: true,
        email: res.data.user.email,
        name: res.data.user.name,
        token: res.data.token,
        backendUrl: effectiveUrl,
        lastSynced: undefined,
        syncing: false,
      };
      const current = useData.getState().settings;
      if (!current) throw new Error('Settings not loaded');
      await persist({ ...current, updatedAt: Date.now(), onlineAccount: acc });
      setStatus(`✓ Connected as ${res.data.user.email}`);
      const outcome = await autoSyncOnLogin();
      if (outcome.ok) setMsg(`✓ Signed in · pulled ${outcome.pulled} record(s)`);
      setTimeout(() => navigate('/'), 1200);
    } catch (e: any) {
      setMsg('⚠️ ' + (e?.message || 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const input = 'input';
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="mb-4 text-center">
          <img src="./v1.PNG" alt="CLINICAL Rx" className="mx-auto h-16 w-16 rounded-2xl object-cover" />
          <h1 className="mt-2 text-xl font-bold">☁️ CLINICAL Rx Cloud</h1>
          <p className="text-sm text-slate-400">Sign in to sync your data & AI setup across devices.</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className={`btn ${mode === 'signin' ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`} onClick={() => setMode('signin')}>Sign in</button>
          <button className={`btn ${mode === 'signup' ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`} onClick={() => setMode('signup')}>Create account</button>
        </div>

        <div className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="label">Name</label>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className={input} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label className="label">Security question (optional, for password reset)</label>
                <input className={input} value={form.securityQuestion} onChange={(e) => setForm({ ...form, securityQuestion: e.target.value })} placeholder="e.g. Your first school" />
              </div>
              <div>
                <label className="label">Security answer</label>
                <input className={input} value={form.securityAnswer} onChange={(e) => setForm({ ...form, securityAnswer: e.target.value })} placeholder="Answer" />
              </div>
            </>
          )}

          <button className="btn-primary w-full !py-2.5" disabled={busy || !form.email || !form.password} onClick={submit}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in & sync' : 'Create account'}
          </button>

          {msg && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{msg}</div>}

          <div className="flex items-center justify-between pt-1 text-xs">
            <button className="btn-ghost !p-0 text-brand-600 dark:text-brand-400" onClick={() => navigate('/settings')}>Settings</button>
            <button className="btn-ghost !p-0 text-brand-600 dark:text-brand-400" onClick={() => navigate('/settings')}>Forgot password?</button>
          </div>
        </div>
      </div>
    </div>
  );
}
