import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import {
  currentStage as academicCurrentStage,
  periodsFor as academicPeriodsFor,
  setCurrentPeriod as academicSetCurrentPeriod,
} from '../services/academic';
import { PageHeader, PasswordInput } from '../components/ui';
import { Modal } from '../components/Modal';
import { UpdatePanel } from '../components/UpdatePanel';
import { AI_MODULES, newSettings } from '../services/defaults';
import { loadSampleData, removeSampleData } from '../services/demo';
import { syncClient, DEFAULT_BACKEND_URL } from '../services/syncClient';
import { hasElectronBridge } from '../db/adapter';
import { syncNowFull, autoSyncOnLogin, getPendingCount, savePending } from '../services/syncEngine';
import { syncAiConfig, queuePushAiConfig } from '../services/aiConfigSync';
import { saveBank } from '../services/questionBank';
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
  const [testBusy, setTestBusy] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [secQ, setSecQ] = useState('');
  const [secQMsg, setSecQMsg] = useState('');
  const [secQBusy, setSecQBusy] = useState(false);

  async function fetchSecQuestion() {
    const em = acctForm.email.trim();
    if (!em) return;
    setSecQBusy(true); setSecQ(''); setSecQMsg('');
    const res = await syncClient.getSecurityQuestion(acctForm.backendUrl || bUrl(), em);
    setSecQBusy(false);
    if (!res.ok) { setSecQMsg('⚠️ ' + (res.error || 'Could not check that email.')); return; }
    if (!res.data?.securityQuestion) { setSecQMsg('ℹ️ No security question is set for that account. Use the email reset link (Option 1).'); return; }
    setSecQ(res.data.securityQuestion);
    setSecQMsg('');
  }
  const [acctForm, setAcctForm] = useState(() => ({
    email: '',
    password: '',
    name: draft?.onlineAccount?.name ?? profile?.username ?? '',
    // Desktop has no same-origin /api, so prefill the deployed backend URL.
    backendUrl: draft?.onlineAccount?.backendUrl || (hasElectronBridge() ? DEFAULT_BACKEND_URL : ''),
    securityQuestion: '',
    securityAnswer: '',
  }));
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
      try {
        const outcome = await autoSyncOnLogin();
        // autoSyncOnLogin also pulls the cloud AI config (keys included).
        const latest = useData.getState().settings;
        if (latest) setDraft(latest); // reflect pulled AI keys in the form
        if (outcome.ok) setSyncState(`✓ Connected · pulled ${outcome.pulled} record(s) (auto-synced)`);
        else setSyncState(`✓ Connected · sync will retry when online`);
      } catch { setSyncState(`✓ Connected · (sync unavailable right now)`); }
    } catch (e: any) { setSyncState('⚠️ ' + (e?.message || 'Something went wrong.')); } finally { setAcctBusy(false); }
  }

  async function doSyncNow() {
    setAcctBusy(true); setSyncState('Syncing…');
    const outcome = await syncNowFull();
    let extra = '';
    if (outcome.ok) {
      // Also sync the AI config (pull cloud -> local, or seed cloud if empty).
      const ai = await syncAiConfig();
      if (ai.pulled) extra = ' · AI config pulled';
      else if (ai.pushed) extra = ' · AI config backed up';
      const latest = useData.getState().settings;
      if (latest) setDraft(latest);
    }
    setSyncState(outcome.ok ? `✓ Full sync · pushed ${outcome.pushed}, pulled ${outcome.pulled}${extra}` : '⚠️ ' + (outcome.message || 'Sync failed.'));
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
    const res = await syncClient.reset(acctForm.backendUrl || bUrl(), { method: 'security', email: acctForm.email.trim(), password: acctForm.password, securityAnswer: acctForm.securityAnswer.trim() });
    setSyncState(res.data?.message || (res.error || 'Reset failed.'));
    setAcctBusy(false);
  }

  async function backup() {
    const { downloadBackup } = await import('../services/backup');
    downloadBackup();
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
      await put('lesson', recs.lessons); await put('revision', recs.revisions); await put('bundle', recs.bundles); await put('chat', recs.chats); await put('quiz', recs.quizzes); await put('reminder', recs.reminders);
      // Ward rounds + academic journey (added in later versions; older
      // backups simply have no such records and are skipped safely).
      await put('wardRound', recs.wardRounds); await put('wardEntry', recs.wardEntries); await put('wardAnalysis', recs.wardAnalyses);
      await put('academicStage', recs.academicStages); await put('academicPeriod', recs.academicPeriods); await put('course', recs.courses);
      await st.init(); setStatus('✓ Backup imported');
    } catch (e: any) { setStatus('⚠️ Import failed: ' + e.message); }
  }

  async function clearAll() {
    if (!confirm('Delete ALL local data? This cannot be undone.')) return;
    const st = useData.getState();
    const modules: any[] = ['day', 'disease', 'medicine', 'investigation', 'question', 'lesson', 'revision', 'bundle', 'chat', 'quiz', 'reminder', 'wardRound', 'wardEntry', 'wardAnalysis', 'academicStage', 'academicPeriod', 'course', 'profile', 'settings'];
    for (const m of modules) { const items = await st.adapter.list(m); for (const it of items) await st.adapter.remove(m, it.id); }
    // Also drop the offline sync queue and the question bank so no stale
    // operations or questions survive a full reset.
    savePending([]);
    saveBank([]);
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

        {/* Local profile */}
        <div className="card">
          <h2 className="mb-1 font-semibold">👤 Profile</h2>
          <p className="mb-3 text-xs text-slate-400">Stored locally on this device. No account required.</p>
          <div className="space-y-3">
            <div>
              <label className={label}>Name</label>
              <input
                className={input}
                value={profile?.username ?? ''}
                onChange={(e) => profile && saveProfile({ ...profile, username: e.target.value, updatedAt: Date.now() })}
              />
            </div>
            <div>
              <label className={label}>Programme</label>
              <input
                className={input}
                value={profile?.programme ?? ''}
                onChange={(e) => profile && saveProfile({ ...profile, programme: e.target.value, updatedAt: Date.now() })}
              />
            </div>
            <div>
              <label className={label}>Institution</label>
              <input
                className={input}
                value={profile?.institution ?? ''}
                placeholder="e.g. KNUST"
                onChange={(e) => profile && saveProfile({ ...profile, institution: e.target.value, updatedAt: Date.now() })}
              />
            </div>
          </div>
        </div>

        {/* Academic */}
        <AcademicSettings />

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
              <div><label className={label}>Backend URL</label><input className={input} placeholder={DEFAULT_BACKEND_URL} value={acctForm.backendUrl} onChange={(e) => setAcctForm({ ...acctForm, backendUrl: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Name</label><input className={input} value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} placeholder="Your name" /></div>
                <div><label className={label}>Email</label><input className={input} type="email" value={acctForm.email} onChange={(e) => setAcctForm({ ...acctForm, email: e.target.value })} placeholder="you@example.com" /></div>
              </div>
              <div><label className={label}>Password</label><PasswordInput value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} placeholder="At least 6 characters" /></div>
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
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <span className="text-xs text-slate-500">🤖 Auto-backup</span>
              <select
                className="input !w-auto !py-1 text-xs"
                value={draft.autoBackup ?? 'off'}
                onChange={(e) => set('autoBackup', e.target.value)}
                title="Automatically download a backup on this schedule (when the app opens and one is due)"
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {draft.lastAutoBackup ? (
              <p className="text-[11px] text-slate-400">Last auto-backup: {new Date(draft.lastAutoBackup).toLocaleString()}</p>
            ) : null}
            <label className="btn-secondary w-full cursor-pointer">⬆ Import backup<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} /></label>
            <button className="btn-secondary w-full" onClick={async () => { if (await loadSampleData()) setStatus('✓ Sample data loaded'); }}>🧪 Load sample data</button>
            <button className="btn-secondary w-full !text-red-600" onClick={async () => { const n = await removeSampleData(); if (n) setStatus(`✓ Removed ${n} sample record(s)`); }}>🗑 Remove sample data</button>
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
                  <div><label className={label}>Model</label>
                    <input
                      className={input}
                      list={`models-${m.key}`}
                      value={cfg.model}
                      placeholder={modelPlaceholder(cfg.provider)}
                      onChange={(e) => updateAi(draft, m.key, { model: e.target.value }, saveSettings, setDraft)}
                      title="Pick a model or type your own"
                    />
                    <datalist id={`models-${m.key}`}>
                      {modelsFor(cfg.provider).map((mo) => <option key={mo} value={mo} />)}
                    </datalist>
                  </div>
                  <div><label className={label}>API Key</label><div className="flex flex-wrap gap-1"><input type={showKeys[m.key] ? 'text' : 'password'} className="input min-w-40 flex-1" value={cfg.apiKey} placeholder="sk-…" onChange={(e) => updateAi(draft, m.key, { apiKey: e.target.value }, saveSettings, setDraft)} /><button className="btn-secondary shrink-0" onClick={() => setShowKeys({ ...showKeys, [m.key]: !showKeys[m.key] })}>{showKeys[m.key] ? '🙈' : '👁'}</button><button className="btn-secondary shrink-0" title="Use this key + provider for all AI sections (so every section works with one key)" onClick={() => applyKeyToAll(draft, m.key, saveSettings, setDraft, setStatus)}>⇄ All</button><button className="btn-secondary shrink-0" title="Test this API key with a tiny request" disabled={testBusy[m.key]} onClick={() => void testModuleKey(m.key, setTestBusy, setTestResult)}>{testBusy[m.key] ? 'Testing…' : '🔌 Test'}</button></div>
                  {testResult[m.key] && <div className={`mt-1 text-[11px] ${testResult[m.key].startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{testResult[m.key]}</div>}
                  </div>
                </div>
                {cfg.provider === 'custom' && <div className="mt-2"><label className={label}>Base URL</label><input className={input} value={cfg.baseUrl ?? ''} placeholder="https://api.example.com" onChange={(e) => updateAi(draft, m.key, { baseUrl: e.target.value }, saveSettings, setDraft)} /></div>}
                {cfg.provider === 'nvidia' && <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">🟩 NVIDIA NIM endpoint: <code>https://integrate.api.nvidia.com/v1</code> · default model <code>meta/llama-3.3-70b-instruct</code>.</div>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">🔐 On the desktop app, keys should be stored in the OS secure credential store. This version stores them with your local data — export backups with care.</p>
      </div>

      <div className="mt-6"><ComingLaterSettings /></div>
      <div className="mt-6"><UpdatePanel /></div>

      {/* Admin panel — lives beside Updates in Settings now */}
      <div className="mt-6 card">
        <h2 className="mb-1 font-semibold">🛡️ Admin Panel</h2>
        <p className="mb-3 text-xs text-slate-400">Manage users, reset passwords and review accounts (admin access required).</p>
        <button className="btn-secondary" onClick={() => navigate('/admin')}>Open Admin Panel →</button>
      </div>

      {/* Change password modal */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="🔑 Change password">
        <div className="space-y-3 text-sm">
          <div><label className={label}>Current password</label><PasswordInput value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} /></div>
          <div><label className={label}>New password</label><PasswordInput value={pwForm.new1} onChange={(e) => setPwForm({ ...pwForm, new1: e.target.value })} placeholder="At least 6 characters" /></div>
          <div><label className={label}>Confirm new password</label><PasswordInput value={pwForm.new2} onChange={(e) => setPwForm({ ...pwForm, new2: e.target.value })} /></div>
          <button className="btn-primary w-full" disabled={acctBusy || !pwForm.current || !pwForm.new1 || !pwForm.new2} onClick={doChangePassword}>{acctBusy ? '…' : 'Change password'}</button>
          {syncState && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{syncState}</div>}
        </div>
      </Modal>

      {/* Delete account modal */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="🗑 Delete account">
        <div className="space-y-3 text-sm">
          <p className="text-red-600 dark:text-red-400">⚠️ This will permanently delete your cloud account and all synced data. Local data is kept.</p>
          <div><label className={label}>Type <strong>DELETE</strong> to confirm</label><input className={input} value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" /></div>
          <div><label className={label}>Your password (to confirm)</label><PasswordInput value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} /></div>
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
              <input className={input} type="email" value={acctForm.email} onChange={(e) => { setAcctForm({ ...acctForm, email: e.target.value }); setSecQ(''); }} placeholder="your@email.com" />
              <button className="btn-secondary w-full" disabled={acctBusy || !acctForm.email.trim()} onClick={() => void fetchSecQuestion()}>
                {secQBusy ? 'Fetching…' : '🔎 Show my security question'}
              </button>
              {secQ ? (
                <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                  🔒 <span className="font-semibold">Your security question:</span>
                  <div className="mt-1 font-medium">{secQ}</div>
                </div>
              ) : secQMsg ? (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{secQMsg}</div>
              ) : null}
              <PasswordInput value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} placeholder="New password" />
              <input className={input} value={acctForm.securityAnswer} onChange={(e) => setAcctForm({ ...acctForm, securityAnswer: e.target.value })} placeholder="Your answer" disabled={!secQ} />
              <button className="btn-primary w-full" disabled={acctBusy || !acctForm.email || !acctForm.password || !acctForm.securityAnswer || !secQ} onClick={doResetSecurity}>
                {acctBusy ? '…' : 'Reset with security question'}
              </button>
            </div>
          </div>
          {syncState && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{syncState}</div>}
        </div>
      </Modal>

      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-slate-400">
        <img src="./v2.PNG" alt="CLINICAL Rx logo" className="h-10 w-10 rounded-lg object-cover" />
        <div>CLINICAL Rx v{__APP_VERSION__} · Built with React + Electron + SQLite · Web via Vercel</div>
      </div>
    </div>
  );
}

async function testModuleKey(key: string, setTestBusy: any, setTestResult: any) {
  const d = useData.getState().settings;
  if (!d) return;
  // Use the module's own key, or borrow from another enabled module (same as
  // the runtime resolution in aiTools.getEffectiveAiConfig).
  const cfg = d.ai?.[key];
  if (!cfg) return;
  let eff = { ...cfg };
  if (!eff.apiKey?.trim()) {
    const all = d.ai ?? {};
    for (const [k2, c] of Object.entries(all)) {
      if (k2 === key || !c) continue;
      if (c.enabled && c.apiKey?.trim()) { eff = { ...eff, apiKey: c.apiKey.trim(), model: eff.model || c.model || '' }; break; }
    }
  }
  if (!eff.apiKey?.trim()) {
    setTestResult((r: any) => ({ ...r, [key]: 'Enter an API key first (or one is borrowed from another section).' }));
    return;
  }
  setTestBusy((b: any) => ({ ...b, [key]: true }));
  setTestResult((r: any) => ({ ...r, [key]: '' }));
  try {
    const { testAiKey } = await import('../services/ai');
    const res = await testAiKey(eff);
    setTestResult((r: any) => ({ ...r, [key]: res.ok ? `✓ Key works — responded in ${res.ms}ms` : `✗ ${res.error || 'Test failed'}` }));
  } catch (e: any) {
    setTestResult((r: any) => ({ ...r, [key]: '✗ ' + (e?.message || 'Test failed') }));
  } finally {
    setTestBusy((b: any) => ({ ...b, [key]: false }));
  }
}

/** Copy one module's API key + provider (+ baseUrl) to every AI section. */
function applyKeyToAll(draft: Settings, key: string, saveSettings: any, setDraft: any, setStatus: any) {
  const src = draft.ai?.[key];
  if (!src || !src.apiKey?.trim()) { setStatus('⚠️ Add an API key to this section first, then tap ⇄ All.'); return; }
  const ai: Record<string, any> = {};
  for (const [k, c] of Object.entries(draft.ai ?? {})) {
    ai[k] = { ...c, provider: src.provider, apiKey: src.apiKey, baseUrl: src.baseUrl ?? c.baseUrl };
  }
  const next = { ...draft, ai };
  void saveSettings({ ...next, updatedAt: Date.now() });
  setDraft(next);
  setStatus('✓ Copied key + provider to all AI sections');
}

function modelPlaceholder(provider: string): string {
  switch (provider) { case 'nvidia': return 'meta/llama-3.3-70b-instruct'; case 'anthropic': return 'claude-3-5-sonnet-latest'; case 'openrouter': return 'openai/gpt-4o-mini'; default: return 'gpt-4o-mini'; }
}

/** Available models per provider — users can pick from these or type their own. */
const MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini', 'o4-mini'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku', 'claude-3-sonnet'],
  openrouter: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.0-flash', 'meta-llama/llama-3.3-70b-instruct', 'mistralai/mistral-small', 'deepseek/deepseek-chat'],
  nvidia: ['meta/llama-3.3-70b-instruct', 'meta/llama-3.1-8b-instruct', 'mistralai/mistral-nemo-12b-instruct', 'google/gemma-2-27b-it', 'qwen/qwen-2.5-72b-instruct'],
  custom: ['gpt-4o-mini', 'gpt-4o', 'llama-3.3-70b-instruct', 'claude-3-5-sonnet-latest'],
};

function modelsFor(provider: string): string[] {
  const list = MODELS_BY_PROVIDER[provider] || MODELS_BY_PROVIDER.custom;
  // Keep the user's current model visible at the top if it's not in the list.
  return list;
}

async function updateAi(draft: Settings, key: string, patch: any, saveSettings: any, setDraft: any) {
  const ai = { ...draft.ai, [key]: { ...draft.ai[key], ...patch } };
  const next = { ...draft, ai };
  // Await the local save first so the cloud push reads the latest config
  // (previously it could push a stale copy missing the newest keystroke).
  await saveSettings({ ...next, updatedAt: Date.now() });
  setDraft(next);
  // Debounced push — rapid edits collapse into one request, last edit wins.
  queuePushAiConfig();
}

/**
 * Academic settings — current level, academic year and semester.
 * Changing the level here PROMOTES via the journey service (additive), it
 * never rewrites history.
 */
function AcademicSettings() {
  const profile = useData((s) => s.profile);
  const stages = useData((s) => s.academicStages);
  const periods = useData((s) => s.academicPeriods);
  const navigate = useNavigate();

  const stage = academicCurrentStage();
  const stagePeriods = stage ? academicPeriodsFor(stage.id) : [];
  void stages;
  void periods;

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold">🎓 Academic</h2>
      <p className="mb-3 text-xs text-slate-400">
        Your current position in the programme. Previous years always stay accessible.
      </p>

      {!stage ? (
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          No academic journey yet.
          <button className="btn-secondary mt-2 w-full !py-1.5 text-xs" onClick={() => navigate('/journey')}>
            Set up my journey →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 dark:bg-brand-950">
            <div>
              <div className="text-sm font-bold text-brand-800 dark:text-brand-200">{stage.name}</div>
              <div className="text-xs text-brand-700/70 dark:text-brand-300/70">{stage.academicYear}</div>
            </div>
            <button className="btn-secondary !py-1 text-xs" onClick={() => navigate('/journey')}>
              Manage journey →
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Current semester
            </label>
            <div className="flex flex-wrap gap-1.5">
              {stagePeriods.map((p) => (
                <button
                  key={p.id}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    profile?.currentPeriodId === p.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                  onClick={() => academicSetCurrentPeriod(p.id)}
                >
                  {p.name}
                </button>
              ))}
              {!stagePeriods.length && <span className="text-xs text-slate-400">No semesters defined.</span>}
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            To move to the next level, use <strong>PharmD Journey → Move to Level …</strong>. Promotion archives the
            current year; it never deletes it.
          </p>
        </div>
      )}
    </div>
  );
}

/** Future modules — declared honestly rather than faked. */
function ComingLaterSettings() {
  const items = [
    { icon: '🤖', title: 'AI settings', detail: 'Cloud AI is configured above. Local (on-device) AI arrives in a later phase.' },
    { icon: '☁️', title: 'Cloud sync', detail: 'Optional multi-device sync — see Online Account above.' },
    { icon: '💼', title: 'Professional portfolio & CV builder', detail: 'Planned for a later phase.' },
  ];
  return (
    <div className="card">
      <h2 className="mb-1 font-semibold">🧭 Coming in later phases</h2>
      <p className="mb-3 text-xs text-slate-400">Reserved space — these are not implemented yet.</p>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.title} className="flex gap-2.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 dark:border-slate-700">
            <span className="text-lg leading-none">{i.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{i.title}</div>
              <div className="text-[11px] text-slate-400">{i.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
