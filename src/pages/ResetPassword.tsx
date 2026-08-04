import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { syncClient } from '../services/syncClient';
import { useData } from '../stores/data';
import { PasswordInput } from '../components/ui';

type Step = 'idle' | 'question' | 'newpass';

export function ResetPassword() {
  const navigate = useNavigate();
  const setStatus = useData((s) => s.setStatus);
  const backendUrl = useData((s) => s.settings?.onlineAccount?.backendUrl ?? '');

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function findQuestion() {
    if (!email.trim()) { setMsg('⚠️ Enter your account email first.'); return; }
    setBusy(true); setMsg('');
    const res = await syncClient.getSecurityQuestion(backendUrl, email.trim());
    setBusy(false);
    if (!res.ok) { setMsg('⚠️ ' + (res.error || 'Could not check that email.')); return; }
    if (!res.data?.securityQuestion) {
      setMsg('ℹ️ No security question is set for that account. Use the email reset link instead (Settings → Forgot password).');
      return;
    }
    setQuestion(res.data.securityQuestion);
    setStep('question');
    setMsg('');
  }

  async function submit() {
    if (step === 'idle') { await findQuestion(); return; }
    if (step === 'question') {
      if (!answer.trim()) { setMsg('⚠️ Enter the answer to your security question.'); return; }
      setStep('newpass');
      setMsg('');
      return;
    }
    if (password.length < 6) { setMsg('⚠️ New password must be at least 6 characters.'); return; }
    setBusy(true); setMsg('');
    const res = await syncClient.reset(backendUrl, {
      method: 'security',
      email: email.trim(),
      password,
      securityAnswer: answer.trim(),
    });
    setBusy(false);
    setMsg(res.data?.message || res.error || 'Reset failed.');
    if (res.ok) setStatus('✓ Password reset — you can now sign in.');
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h2 className="mb-1 text-lg font-bold">Reset your password</h2>
        <p className="mb-4 text-sm text-slate-400">
          {step === 'idle' && 'Enter your account email to reveal your security question.'}
          {step === 'question' && 'Answer your security question to continue.'}
          {step === 'newpass' && 'Correct! Now set a new password.'}
        </p>

        <div className="space-y-3">
          {step !== 'newpass' && (
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={step === 'question'} />
            </div>
          )}

          {step === 'question' && (
            <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              🔒 <span className="font-semibold">Your security question:</span>
              <div className="mt-1 font-medium">{question}</div>
            </div>
          )}

          {step === 'question' && (
            <div>
              <label className="label">Security answer</label>
              <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" autoFocus />
            </div>
          )}

          {step === 'newpass' && (
            <div>
              <label className="label">New password</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoFocus />
            </div>
          )}

          <button className="btn-primary w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Working…' : step === 'idle' ? 'Continue' : step === 'question' ? 'Verify answer' : 'Reset password'}
          </button>

          {msg && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{msg}</div>}

          {step !== 'idle' && (
            <button className="btn-secondary w-full" onClick={() => { setStep('idle'); setMsg(''); setAnswer(''); setPassword(''); }}>
              ← Start over
            </button>
          )}
          {msg && !busy && (
            <button className="btn-secondary w-full" onClick={() => navigate('/settings')}>Go to Settings →</button>
          )}
        </div>
      </div>
    </div>
  );
}
