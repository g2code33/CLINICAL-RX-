import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader } from '../components/ui';
import { UpdatePanel } from '../components/UpdatePanel';
import { AI_MODULES, newSettings } from '../services/defaults';
import { loadSampleData } from '../services/demo';
import { syncClient } from '../services/syncClient';
import { syncNow, getPendingCount } from '../services/syncEngine';
import type { AppearanceMode, Settings } from '../types';

export function SettingsPage() {
  const settings = useData((s) => s.settings);
  const saveSettings = useData((s) => s.saveSettings);
  const save = useData((s) => s.save);
  const setStatus = useData((s) => s.setStatus);
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [acctForm, setAcctForm] = useState({ email: '', password: '', name: '', backendUrl: draft?.onlineAccount?.backendUrl ?? '' });
  const [acctBusy, setAcctBusy] = useState(false);
  const [syncState, setSyncState] = useState<string>('');
  const pendingCount = getPendingCount();

  if (!draft) return null;

  async function persist(next: Settings) {
    await saveSettings({ ...next, updatedAt: Date.now() });
    setDraft(next);
    setStatus('✓ Settings saved');
  }

  function set(key: string, value: any) {
    persist({ ...draft, [key]: value } as Settings);
  }

  async function connect(mode: 'login' | 'register') {
    setAcctBusy(true);
    setSyncState('');
    const { email, password, name, backendUrl } = acctForm;
    try {
      const res = mode === 'login'
        ? await syncClient.login(backendUrl, email.trim(), password)
        : await syncClient.register(backendUrl, email.trim(), password, name.trim());
      if (!res.ok) {
        setSyncState('⚠️ ' + (res.error || 'Connection failed.'));
        return;
      }
      const acc = {
        connected: true,
        email: res.data.user.email,
        name: res.data.user.name,
        token: res.data.token,
        backendUrl,
        lastSynced: undefined,
        syncing: false,
      };
      await persist({ ...draft, onlineAccount: acc } as Settings);
      setSyncState(`✓ Connected as ${res.data.user.email}`);
      // Immediately pull any cloud data down to this device.
      const outcome = await syncNow();
      if (outcome.ok) setSyncState(`✓ Connected · pulled ${outcome.pulled} record(s)`);
    } finally {
      setAcctBusy(false);
    }
  }

  async function doSyncNow() {
    setAcctBusy(true);
    setSyncState('Syncing…');
    const outcome = await syncNow();
    setSyncState(outcome.ok
      ? `✓ Synced · pushed ${outcome.pushed}, pulled ${outcome.pulled}`
      : '⚠️ ' + (outcome.message || 'Sync failed.'));
    setAcctBusy(false);
  }

  async function disconnect() {
    await persist({ ...draft, onlineAccount: { connected: false, backendUrl: acctForm.backendUrl } } as Settings);
    setSyncState('Disconnected. Local data is kept.');
  }

  async function backup() {
    const state = useData.getState();
    const data = {
      app: 'clinical-rx',
      version: 1,
      exportedAt: new Date().toISOString(),
      records: {
        profile: state.profile,
        settings: state.settings,
        days: state.days, diseases: state.diseases, medicines: state.medicines,
        investigations: state.investigations, questions: state.questions,
        lessons: state.lessons, revisions: state.revisions, bundles: state.bundles,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-rx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('✓ Backup downloaded');
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.app !== 'clinical-rx') throw new Error('Not a CLINICAL Rx backup');
      const recs = data.records;
      const st = useData.getState();
      const put = async (module: any, list: any) => {
        for (const r of list ?? []) await st.adapter.put(module, r.id, r, r.createdAt, r.updatedAt);
      };
      await put('profile', [recs.profile]);
      await put('settings', [recs.settings]);
      await put('day', recs.days); await put('disease', recs.diseases); await put('medicine', recs.medicines);
      await put('investigation', recs.investigations); await put('question', recs.questions);
      await put('lesson', recs.lessons); await put('revision', recs.revisions); await put('bundle', recs.bundles);
      await st.init();
      setStatus('✓ Backup imported');
    } catch (e: any) {
      setStatus('⚠️ Import failed: ' + e.message);
    }
  }

  async function clearAll() {
    if (!confirm('Delete ALL local data? This cannot be undone.')) return;
    const st = useData.getState();
    const modules: any[] = ['day', 'disease', 'medicine', 'investigation', 'question', 'lesson', 'revision', 'bundle', 'profile', 'settings'];
    for (const m of modules) {
      const items = await st.adapter.list(m);
      for (const it of items) await st.adapter.remove(m, it.id);
    }
    const fresh = newSettings();
    await saveSettings(fresh);
    const p = useData.getState().profile;
    if (p) {
      const np = { ...p, id: 'profile-' + Date.now(), createdAt: Date.now() };
      await useData.getState().saveProfile(np);
    }
    await st.init();
    setDraft(fresh);
    setStatus('✓ Data cleared');
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Appearance, clinical profile, AI configuration, data and account." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appearance */}
        <div className="card">
          <h2 className="mb-3 font-semibold">Appearance</h2>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as AppearanceMode[]).map((m) => (
              <button key={m} onClick={() => set('appearance', m)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${draft.appearance === m ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label">Clinical site</label>
              <input className="input" value={draft.clinicalSite} onChange={(e) => set('clinicalSite', e.target.value)} />
            </div>
            <div>
              <label className="label">Course / Programme</label>
              <input className="input" value={draft.course} onChange={(e) => set('course', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Online account */}
        <div className="card">
          <h2 className="mb-1 font-semibold">☁️ Online Account &amp; Sync</h2>
          <p className="mb-3 text-xs text-slate-400">Optional &amp; secondary. The app works fully offline without an account; connecting enables multi-device cloud sync &amp; backup.</p>

          {draft.onlineAccount?.connected ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900 dark:text-green-200">
                ✓ Connected · {draft.onlineAccount.email}
                {draft.onlineAccount.lastSynced && (
                  <div className="mt-1 text-xs text-green-600 dark:text-green-300">
                    Last synced {new Date(draft.onlineAccount.lastSynced).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Pending local changes</span>
                <span className="font-semibold">{pendingCount}</span>
              </div>
              <button className="btn-primary w-full" disabled={acctBusy} onClick={doSyncNow}>
                {acctBusy ? 'Syncing…' : '🔄 Sync now'}
              </button>
              <button className="btn-secondary w-full" onClick={disconnect}>Disconnect account</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label">Backend URL</label>
                <input
                  className="input"
                  placeholder="https://your-app.vercel.app (blank = same site)"
                  value={acctForm.backendUrl}
                  onChange={(e) => setAcctForm({ ...acctForm, backendUrl: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} placeholder="Your name" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={acctForm.email} onChange={(e) => setAcctForm({ ...acctForm, email: e.target.value })} placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} placeholder="At least 6 characters" />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={acctBusy || !acctForm.email || !acctForm.password} onClick={() => connect('login')}>
                  {acctBusy ? '…' : 'Sign in'}
                </button>
                <button className="btn-secondary flex-1" disabled={acctBusy || !acctForm.email || !acctForm.password} onClick={() => connect('register')}>
                  {acctBusy ? '…' : 'Create account'}
                </button>
              </div>
            </div>
          )}

          {syncState && <div className="mt-3 text-sm text-slate-500 dark:text-slate-300">{syncState}</div>}
        </div>

        {/* Learning profile */}
        <div className="card">
          <h2 className="mb-3 font-semibold">🎓 Learning Profile</h2>
          <label className="label">Preferred explanation</label>
          <div className="flex flex-wrap gap-2">
            {['simple-first', 'step-by-step', 'pharmacy-focused', 'clinical-examples', 'exam-connections'].map((o) => {
              const on = (draft.learningProfile?.preferredExplanation ?? []).includes(o);
              return (
                <button key={o} onClick={() => set('learningProfile', {
                  preferredExplanation: on
                    ? (draft.learningProfile?.preferredExplanation ?? []).filter((x) => x !== o)
                    : [...(draft.learningProfile?.preferredExplanation ?? []), o],
                })}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                  {o.replace(/-/g, ' ')}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.autoDailyBundle} onChange={(e) => set('autoDailyBundle', e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Auto-generate daily bundle
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.autoWeeklyBundle} onChange={(e) => set('autoWeeklyBundle', e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Auto-generate weekly bundle
            </div>
          </div>
        </div>

        {/* Data */}
        <div className="card">
          <h2 className="mb-3 font-semibold">Data</h2>
          <div className="space-y-2">
            <button className="btn-secondary w-full" onClick={backup}>⬇ Download backup</button>
            <label className="btn-secondary w-full cursor-pointer">
              ⬆ Import backup
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
            </label>
            <button className="btn-secondary w-full" onClick={async () => { if (await loadSampleData()) setStatus('✓ Sample data loaded'); }}>
              🧪 Load sample data
            </button>
            <button className="btn-secondary w-full !text-red-600" onClick={clearAll}>🗑 Clear all data</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Data is stored locally (SQLite on desktop, browser storage on web). Backups are portable between the two.
          </p>
        </div>
      </div>

      {/* AI config */}
      <div className="mt-6 card">
        <h2 className="mb-1 font-semibold">🤖 AI Configuration</h2>
        <p className="mb-4 text-xs text-slate-400">
          Each AI module has its own provider, API key and model. Keys are required only to use AI online; the rest of the app works offline without them.
        </p>
        <div className="space-y-4">
          {AI_MODULES.map((m) => {
            const cfg = draft.ai?.[m.key];
            if (!cfg) return null;
            return (
              <div key={m.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">{m.label}
                    <input type="checkbox" checked={cfg.enabled} onChange={(e) => updateAi(draft, m.key, { enabled: e.target.checked }, saveSettings, setDraft)} className="ml-2 h-4 w-4 accent-brand-600" title="Enable module" />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <label className="label">Provider</label>
                    <select className="input" value={cfg.provider} onChange={(e) => updateAi(draft, m.key, { provider: e.target.value as any }, saveSettings, setDraft)}>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="nvidia">NVIDIA NIM</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <input
                      className="input"
                      value={cfg.model}
                      placeholder={modelPlaceholder(cfg.provider)}
                      onChange={(e) => updateAi(draft, m.key, { model: e.target.value }, saveSettings, setDraft)}
                    />
                  </div>
                  <div>
                    <label className="label">API Key</label>
                    <div className="flex gap-1">
                      <input type={showKeys[m.key] ? 'text' : 'password'} className="input" value={cfg.apiKey} placeholder="sk-…"
                        onChange={(e) => updateAi(draft, m.key, { apiKey: e.target.value }, saveSettings, setDraft)} />
                      <button className="btn-secondary shrink-0" onClick={() => setShowKeys({ ...showKeys, [m.key]: !showKeys[m.key] })}>{showKeys[m.key] ? '🙈' : '👁'}</button>
                    </div>
                  </div>
                </div>
                {cfg.provider === 'custom' && (
                  <div className="mt-2">
                    <label className="label">Base URL</label>
                    <input className="input" value={cfg.baseUrl ?? ''} placeholder="https://api.example.com" onChange={(e) => updateAi(draft, m.key, { baseUrl: e.target.value }, saveSettings, setDraft)} />
                  </div>
                )}
                {cfg.provider === 'nvidia' && (
                  <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                    🟩 NVIDIA NIM endpoint: <code>https://integrate.api.nvidia.com/v1</code> · default model{' '}
                    <code>meta/llama-3.3-70b-instruct</code>. Use any model available on your NVIDIA build.
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          🔐 On the desktop app, keys should be stored in the OS secure credential store. This version stores them with your local data — export backups with care.
        </p>
      </div>

      <div className="mt-6">
        <UpdatePanel />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-slate-400">
        <img src="./icon-512.png" alt="CLINICAL Rx logo" className="h-10 w-10 rounded-lg object-cover" />
        <div>CLINICAL Rx v{__APP_VERSION__} · Built with React + Electron + SQLite · Web via Vercel</div>
      </div>
    </div>
  );
}

function modelPlaceholder(provider: string): string {
  switch (provider) {
    case 'nvidia':
      return 'meta/llama-3.3-70b-instruct';
    case 'anthropic':
      return 'claude-3-5-sonnet-latest';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    default:
      return 'gpt-4o-mini';
  }
}

function updateAi(draft: Settings, key: string, patch: any, saveSettings: any, setDraft: any) {
  const ai = { ...draft.ai, [key]: { ...draft.ai[key], ...patch } };
  const next = { ...draft, ai };
  saveSettings({ ...next, updatedAt: Date.now() });
  setDraft(next);
}
