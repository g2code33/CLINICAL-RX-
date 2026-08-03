import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { PageHeader } from '../components/ui';
import { Modal } from '../components/Modal';
import { UpdatePanel } from '../components/UpdatePanel';
import { AI_MODULES, newSettings } from '../services/defaults';
import { loadSampleData } from '../services/demo';
import { syncClient } from '../services/syncClient';
import { syncNowFull, autoSyncOnLogin, getPendingCount } from '../services/syncEngine';
import type { AppearanceMode, Settings } from '../types';

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const profile = useData((s) => s.profile);
  const saveProfile = useData((s) => s.saveProfile);
  const saveSettings = useData((s) => s.saveSettings);
  const save = useData((s) => s.save);
  const setStatus = useData((s) => s.setStatus);
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [acctForm, setAcctForm] = useState({ email: '', password: '', name: draft?.onlineAccount?.name ?? profile?.username ?? '', backendUrl: draft?.onlineAccount?.backendUrl ?? '', securityQuestion: '', securityAnswer: '' });
  const [acctBusy, setAcctBusy] = useState(false);
  const [syncState, setSyncState] = useState<string>('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', new1: '', new2: '' });
  const [delConfirm, setDelConfirm] = useState('');
  const pendingCount = getPendingCount();

  if (!draft) return null;

  async function persist(next: Settings) {
    await saveSettings({ ...next, updatedAt: Date.now() });
    setDraft(next);
    setStatus('Settings saved');
  }

  function set(key: string, value: any) {
    persist({ ...draft, [key]: value } as Settings);
  }

  function token(): string { return draft?.onlineAccount?.token ?? ''; }
  function bUrl(): string { return draft?.onlineAccount?.backendUrl ?? ''; }

  async function connect(mode: 'login' | 'register') {
    setAcctBusy(true);
    setSyncState('');
    const { email, password, name, backendUrl, securityQuestion, securityAnswer } = acctForm;
    try {
      const res = mode === 'login'
        ? await syncClient.login(backendUrl, email.trim(), password)
        : await syncClient.register(backendUrl, email.trim(), password, name.trim(), securityQuestion.trim() || undefined, securityAnswer.trim() || undefined);
      if (!res.ok) { setSyncState('⚠️ ' + (res.error || 'Connection failed.')); return; }
      const acc = { connected: true, email: res.data.user.email, name: res.data.user.name, token: res.data.token, backendUrl, lastSynced: undefined, syncing: false };
      await persist({ ...draft, onlineAccount: acc } as Settings);
      setSyncState(`✓ Connected as ${res.data.user.email}`);
      try { const outcome = await autoSyncOnLogin(); if (outcome.ok) setSyncState(`✓ Connected · pulled ${outcome.pulled} record(s) (auto-synced)`); else setSyncState(`✓ Connected · sync will retry when online`); } catch { setSyncState(`✓ Connected · (sync unavailable right now)`); }
    } catch (e: any) { setSyncState('⚠️ ' + (e?.message || 'Something went wrong.')); } finally { setAcctBusy(false); }
  }

  async function doSyncNow() {
    setAcctBusy(true); setSyncState('Syncing…');
    const outcome = await syncNowFull();
    setSyncState(outcome.ok ? `✓ Full sync · pushed ${outcome.pushed}, pulled ${outcome.pulled}` : '⚠️ ' + (outcome.message || 'Sync failed.'));
    setAcctBusy(false);
  }

  async function disconnect() {
    await persist({ ...draft, onlineAccount: { connected: false, backendUrl: acctForm.backendUrl } } as Settings);
    setSyncState('Disconnected. Local data is kept.');
  }

  async function updateProfile() {
    if (!token()) return;
    setAcctBusy(true); setSyncState('');
    try {
      const res = await syncClient.updateProfile(bUrl(), token(), { name: acctForm.name.trim(), securityQuestion: acctForm.securityQuestion.trim() || undefined, securityAnswer: acctForm.securityAnswer.trim() || undefined });
      if (!res.ok) { setSyncState('⚠️ ' + (res.error || 'Update failed.')); return; }
      const acc = { ...draft!.onlineAccount!, name: res.data.user.name };
      await persist({ ...draft, onlineAccount: acc } as Settings);
      if (profile && acctForm.name.trim()) { await saveProfile({ ...profile, username: acctForm.name.trim() }); }
      setSyncState('✓ Profile updated');
    } catch (e: any) { setSyncState('⚠️ ' + (e?.message || 'Failed')); } finally { setAcctBusy(false); }
  }

  async function doChangePassword() {
    if (pwForm.new1 !== pwForm.new2) { setSyncState('⚠️ New passwords do not match.'); return; }
    if (pwForm.new1.length < 6) { setSyncState('️ New password must be at least 6 characters.'); return; }
    setAcctBusy(true); setSyncState('');
    try {
      const res = await syncClient.changePassword(bUrl(), token(), pwForm.current, pwForm.new1);
      if (!res.ok) { setSyncState('️ ' + (res.error || 'Failed.')); return; }
      setSyncState('✓ Password changed');
      setPwForm({ current: '', new1: '', new2: '' });
      setPwOpen(false);
    } catch (e: any) { setSyncState('⚠️ ' + (e?.message || 'Failed')); } finally { setAcctBusy(false); }
  }

  async function doDeleteAccount() {
    if (delConfirm !== 'DELETE') { setSyncState('⚠️ Type DELETE to confirm.'); return; }
    setAcctBusy(true); setSyncState('');
    try {
      const res = await syncClient.deleteAccount(bUrl(), token(), acctForm.password);
      if (!res.ok) { setSyncState('⚠️ ' + (res.error || 'Failed.')); return; }
      await persist({ ...draft, onlineAccount: { connected: false, backendUrl: bUrl() } } as Settings);
      setSyncState('✓ Account deleted. Local data kept.');
      setDelOpen(false);
      setDelConfirm('');
    } catch (e: any) { setSyncState('⚠️ ' + (e?.message || 'Failed')); } finally { setAcctBusy(false); }
  }

  async function doForgotEmail() {
    setAcctBusy(true); setSyncState('');
    const res = await syncClient.forgot(acctForm.backendUrl || bUrl(), acctForm.email.trim());
    setSyncState(res.data?.message || (res.error || 'Reset request sent.'));
    setAcctBusy(false);
  }

  async function doResetSecurity() {
    setAcctBusy(true); setSyncState('');
    const res = await syncClient.reset(acctForm.backendUrl || bUrl(), { method: 'security', email: acctForm.email.trim(), password: acctForm.password, securityQuestion: acctForm.securityQuestion.trim(), securityAnswer: acctForm.securityAnswer.trim() });
    setSyncState(res.data?.message || (res.error || 'Reset failed.'));
    setAcctBusy(false);
  }

  async function backup() {
    const state = useData.getState();
    const data = { app: 'clinical-rx', version: 1, exportedAt: new Date().toISOString(), records: { profile: state.profile, settings: state.settings, days: state.days, diseases: state.diseases, medicines: state.medicines, investigations: state.investigations, questions: state.questions, lessons: state.lessons, revisions: state.revisions, bundles: state.bundles } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `clinical-rx-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
    setStatus('✓ Backup downloaded');
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text(); const data = JSON.parse(text);
      if (data.app !== 'clinical-rx') throw new Error('Not a CLINICAL Rx backup');
      const recs = data.records; const st = useData.getState();
      const put = async (module: any, list: any) => { for (const r of list ?? []) await st.adapter.put(module, r.id, r, r.createdAt, r.updatedAt); };
      await put('profile', [recs.profile]); await put('settings', [recs.settings]);
      await put('day', recs.days); await put('disease', recs.diseases); await put('medicine', recs.medicines);
      await put('investigation', recs.investigations); await put('question', recs.questions);
      await put('lesson', recs.lessons); await put('revision', recs.revisions); await put('bundle', recs.bundles);
      await st.init(); setStatus('✓ Backup imported');
    } catch (e: any) { setStatus('⚠️ Import failed: ' + e.message); }
  }

  async function clearAll() {
    if (!confirm('Delete ALL local data? This cannot be undone.')) return;
    const st = useData.getState();
    const modules: any[] = ['day', 'disease', 'medicine', 'investigation', 'question', 'lesson', 'revision', 'bundle', 'profile', 'settings'];
    for (const m of modules) { const items = await st.adapter.list(m); for (const it of items) await st.adapter.remove(m, it.id); }
    const fresh = newSettings(); await saveSettings(fresh);
    const p = useData.getState().profile;
    if (p) { const np = { ...p, id: 'profile-' + Date.now(), createdAt: Date.now() }; await useData.getState().saveProfile(np); }
    await st.init(); setDraft(fresh); setStatus('✓ Data cleared');
  }

  const connected = draft.onlineAccount?.connected;
  const input = 'input';
  const label = 'label';

  return (
    <div>
      <PageHeader title="Settings" subtitle="Appearance, clinical profile, AI configuration, data and account." />
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Appearance */}
        <div className="card">
          <h2 className="mb-3 font-semibold">Appearance</h2>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as AppearanceMode[]).map((m) => (
              <button key={m} onClick={() => set('appearance', m)} className={`rounded-full px-3 py-1 text-xs font-medium ${draft.appearance === m ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>{m[0].toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <div><label className={label}>Clinical site</label><input className={input} value={draft.clinicalSite} onChange={(e) => set('clinicalSite', e.target.value)} /></div>
            <div><label className={label}>Course / Programme</label><input className={input} value={draft.course} onChange={(e) => set('course', e.target.value)} /></div>
          </div>
        </div>

        {/* Online Account & Sync */}
        <div className="card">
          <h2 className="mb-1 font-semibold">☁️ Online Account &amp; Sync</h2>
          <p className="mb-3 text-xs text-slate-400">Optional &amp; secondary. The app works fully offline without an account; connecting enables multi-device cloud sync &amp; backup.</p>

          {connected ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900 dark:text-green-200">
                ✓ Connected · {draft.onlineAccount?.email}
                {draft.onlineAccount?.lastSynced && <div className="mt-1 text-xs text-green-600 dark:text-green-300">Last synced {new Date(draft.onlineAccount.lastSynced).toLocaleString()}</div>}
              </div>

              {/* Edit profile */}
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold">Edit Profile</h3>
                <div className="space-y-2">
                  <div><label className={label}>Display name</label><input className={input} value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} /></div>
                  <div><label className={label}>Security question</label><input className={input} value={acctForm.securityQuestion} onChange={(e) => setAcctForm({ ...acctForm, securityQuestion: e.target.value })} placeholder="e.g. Your first school" /></div>
                  <div><label className={label}>Security answer</label><input className={input} value={acctForm.securityAnswer} onChange={(e) => setAcctForm({ ...acctForm, securityAnswer: e.target.value })} placeholder="Answer (for password reset)" /></div>
                  <button className="btn-secondary w-full" disabled={acctBusy} onClick={updateProfile}>💾 Save profile changes</button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500"><span>Pending local changes</span><span className="font-semibold">{pendingCount}</span></div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={acctBusy} onClick={doSyncNow}>{acctBusy ? 'Syncing…' : '🔄 Sync now'}</button>
                <button className="btn-secondary" onClick={() => setPwOpen(true)}>🔑 Change password</button>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost w-full text-red-600 dark:text-red-400" onClick={() => setDelOpen(true)}> Delete account</button>
              </div>
              <button className="btn-secondary w-full" onClick={disconnect}>Disconnect account</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><label className={label}>Backend URL</label><input className={input} placeholder="https://your-app.vercel.app (blank = same site)" value={acctForm.backendUrl} onChange={(e) => setAcctForm({ ...acctForm, backendUrl: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Name</label><input className={input} value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} placeholder="Your name" /></div>
                <div><label className={label}>Email</label><input className={input} type="email" value={acctForm.email} onChange={(e) => setAcctForm({ ...acctForm, email: e.target.value })} placeholder="you@example.com" /></div>
              </div>
              <div><label className={label}>Password</label><input className={input} type="password" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} placeholder="At least 6 characters" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Security question (optional)</label><input className={input} value={acctForm.securityQuestion} onChange={(e) => setAcctForm({ ...acctForm, securityQuestion: e.target.value })} placeholder="e.g. Your first school" /></div>
                <div><label className={label}>Answer</label><input className={input} value={acctForm.securityAnswer} onChange={(e) => setAcctForm({ ...acctForm, securityAnswer: e.target.value })} placeholder="Answer (for reset)" /></div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={acctBusy || !acctForm.email || !acctForm.password} onClick={() => connect('login')}>{acctBusy ? 'Signing in…' : '🔑 Sign in'}</button>
                <button className="btn-secondary flex-1" disabled={acctBusy || !acctForm.email || !acctForm.password} onClick={() => connect('register')}>{acctBusy ? 'Creating…' : '✨ Create account'}</button>
              </div>
              <div className="pt-1 text-right"><button className="btn-ghost !p-0 text-xs text-brand-600 dark:text-brand-400" onClick={() => setForgotOpen(true)}>Forgot password?</button></div>
            </div>
          )}

          {syncState && <div className="mt-3 text-sm text-slate-500 dark:text-slate-300">{syncState}</div>}
        </div>

        {/* Learning Profile */}
        <div className="card">
          <h2 className="mb-3 font-semibold">🎓 Learning Profile</h2>
          <label className={label}>Preferred explanation</label>
          <div className="flex flex-wrap gap-2">
            {['simple-first', 'step-by-step', 'pharmacy-focused', 'clinical-examples', 'exam-connections'].map((o) => {
              const on = (draft.learningProfile?.preferredExplanation ?? []).includes(o);
              return <button key={o} onClick={() => set('learningProfile', { preferredExplanation: on ? (draft.learningProfile?.preferredExplanation ?? []).filter((x) => x !== o) : [...(draft.learningProfile?.preferredExplanation ?? []), o] })} className={`rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>{o.replace(/-/g, ' ')}</button>;
            })}
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.autoDailyBundle} onChange={(e) => set('autoDailyBundle', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Auto-generate daily bundle</div>
            <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.autoWeeklyBundle} onChange={(e) => set('autoWeeklyBundle', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Auto-generate weekly bundle</div>
          </div>
        </div>

        {/* Data */}
        <div className="card">
          <h2 className="mb-3 font-semibold">Data</h2>
          <div className="space-y-2">
            <button className="btn-secondary w-full" onClick={backup}>⬇ Download backup</button>
            <label className="btn-secondary w-full cursor-pointer">⬆ Import backup<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} /></label>
            <button className="btn-secondary w-full" onClick={async () => { if (await loadSampleData()) setStatus('✓ Sample data loaded'); }}>🧪 Load sample data</button>
            <button className="btn-secondary w-full !text-red-600" onClick={clearAll}>🗑 Clear all data</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Data is stored locally (SQLite on desktop, browser storage on web). Backups are portable between the two.</p>
        </div>
      </div>

      {/* AI config */}
      <div className="mt-6 card">
        <h2 className="mb-1 font-semibold">🤖 AI Configuration</h2>
        <p className="mb-4 text-xs text-slate-400">Each AI module has its own provider, API key and model. Keys are required only to use AI online; the rest of the app works offline without them.</p>
        <div className="space-y-4">
          {AI_MODULES.map((m) => {
            const cfg = draft.ai?.[m.key]; if (!cfg) return null;
            return (
              <div key={m.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">{m.label}<input type="checkbox" checked={cfg.enabled} onChange={(e) => updateAi(draft, m.key, { enabled: e.target.checked }, saveSettings, setDraft)} className="ml-2 h-4 w-4 accent-brand-600" title="Enable module" /></div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div><label className={label}>Provider</label><select className={input} value={cfg.provider} onChange={(e) => updateAi(draft, m.key, { provider: e.target.value as any }, saveSettings, setDraft)}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="openrouter">OpenRouter</option><option value="nvidia">NVIDIA NIM</option><option value="custom">Custom</option></select></div>
                  <div><label className={label}>Model</label><input className={input} value={cfg.model} placeholder={modelPlaceholder(cfg.provider)} onChange={(e) => updateAi(draft, m.key, { model: e.target.value }, saveSettings, setDraft)} /></div>
                  <div><label className={label}>API Key</label><div className="flex gap-1"><input type={showKeys[m.key] ? 'text' : 'password'} className={input} value={cfg.apiKey} placeholder="sk-…" onChange={(e) => updateAi(draft, m.key, { apiKey: e.target.value }, saveSettings, setDraft)} /><button className="btn-secondary shrink-0" onClick={() => setShowKeys({ ...showKeys, [m.key]: !showKeys[m.key] })}>{showKeys[m.key] ? '🙈' : '👁'}</button></div></div>
                </div>
                {cfg.provider === 'custom' && <div className="mt-2"><label className={label}>Base URL</label><input className={input} value={cfg.baseUrl ?? ''} placeholder="https://api.example.com" onChange={(e) => updateAi(draft, m.key, { baseUrl: e.target.value }, saveSettings, setDraft)} /></div>}
                {cfg.provider === 'nvidia' && <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">🟩 NVIDIA NIM endpoint: <code>https://integrate.api.nvidia.com/v1</code> · default model <code>meta/llama-3.3-70b-instruct</code>.</div>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">🔐 On the desktop app, keys should be stored in the OS secure credential store. This version stores them with your local data — export backups with care.</p>
      </div>

      <div className="mt-6"><UpdatePanel /></div>

      {/* Change password modal */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="🔑 Change password">
        <div className="space-y-3 text-sm">
          <div><label className={label}>Current password</label><input className={input} type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} /></div>
          <div><label className={label}>New password</label><input className={input} type="password" value={pwForm.new1} onChange={(e) => setPwForm({ ...pwForm, new1: e.target.value })} placeholder="At least 6 characters" /></div>
          <div><label className={label}>Confirm new password</label><input className={input} type="password" value={pwForm.new2} onChange={(e) => setPwForm({ ...pwForm, new2: e.target.value })} /></div>
          <button className="btn-primary w-full" disabled={acctBusy || !pwForm.current || !pwForm.new1 || !pwForm.new2} onClick={doChangePassword}>{acctBusy ? '…' : 'Change password'}</button>
          {syncState && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{syncState}</div>}
        </div>
      </Modal>

      {/* Delete account modal */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="🗑 Delete account">
        <div className="space-y-3 text-sm">
          <p className="text-red-600 dark:text-red-400">⚠️ This will permanently delete your cloud account and all synced data. Local data is kept.</p>
          <div><label className={label}>Type <strong>DELETE</strong> to confirm</label><input className={input} value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" /></div>
          <div><label className={label}>Your password (to confirm)</label><input className={input} type="password" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} /></div>
          <button className="btn-primary w-full !bg-red-600" disabled={acctBusy || delConfirm !== 'DELETE' || !acctForm.password} onClick={doDeleteAccount}>{acctBusy ? '…' : 'Delete my account'}</button>
          {syncState && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{syncState}</div>}
        </div>
      </Modal>

      {/* Forgot / reset password modal */}
      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title=" Reset password">
        <div className="space-y-5 text-sm">
          <div>
            <div className="label mb-2">Option 1 — Email reset link</div>
            <div className="flex gap-2"><input className={input} type="email" value={acctForm.email} onChange={(e) => setAcctForm({ ...acctForm, email: e.target.value })} placeholder="your@email.com" /><button className="btn-secondary shrink-0" disabled={acctBusy || !acctForm.email} onClick={doForgotEmail}>{acctBusy ? '…' : 'Send link'}</button></div>
            <p className="mt-1 text-[11px] text-slate-400">Requires the server to have a mail service (Resend) configured.</p>
          </div>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="label mb-2">Option 2 — Security question</div>
            <div className="space-y-2">
              <input className={input} type="email" value={acctForm.email} onChange={(e) => setAcctForm({ ...acctForm, email: e.target.value })} placeholder="your@email.com" />
              <input className={input} value={acctForm.securityQuestion} onChange={(e) => setAcctForm({ ...acctForm, securityQuestion: e.target.value })} placeholder="Your security question" />
              <input className={input} value={acctForm.securityAnswer} onChange={(e) => setAcctForm({ ...acctForm, securityAnswer: e.target.value })} placeholder="Your answer" />
              <input className={input} type="password" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} placeholder="New password" />
              <button className="btn-primary w-full" disabled={acctBusy || !acctForm.email || !acctForm.password || !acctForm.securityQuestion || !acctForm.securityAnswer} onClick={doResetSecurity}>{acctBusy ? '…' : 'Reset with security question'}</button>
            </div>
          </div>
          {syncState && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{syncState}</div>}
        </div>
      </Modal>

      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-slate-400">
        <img src="./v1.PNG" alt="CLINICAL Rx logo" className="h-10 w-10 rounded-lg object-cover" />
        <div>CLINICAL Rx v{__APP_VERSION__} · Built with React + Electron + SQLite · Web via Vercel</div>
      </div>
    </div>
  );
}

function modelPlaceholder(provider: string): string {
  switch (provider) { case 'nvidia': return 'meta/llama-3.3-70b-instruct'; case 'anthropic': return 'claude-3-5-sonnet-latest'; case 'openrouter': return 'openai/gpt-4o-mini'; default: return 'gpt-4o-mini'; }
}

function updateAi(draft: Settings, key: string, patch: any, saveSettings: any, setDraft: any) {
  const ai = { ...draft.ai, [key]: { ...draft.ai[key], ...patch } };
  const next = { ...draft, ai };
  saveSettings({ ...next, updatedAt: Date.now() });
  setDraft(next);
  import('../services/aiConfigSync').then((m) => m.pushAiConfig()).catch(() => {});
}
