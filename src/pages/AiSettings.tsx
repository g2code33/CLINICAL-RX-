import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { AiStatusDot } from '../components/AiStatus';
import { Tabs } from '../components/ui/primitives';
import { useData } from '../stores/data';
import { AI_MODULES } from '../services/defaults';
import {
  PERSONAS,
  aiLog,
  aiUsage,
  availability,
  clearAiLog,
  refreshKeyCache,
  runDiagnostics,
  type AiPersona,
  type DiagnosticResult,
} from '../services/aiOrchestrator';
import {
  detectLocalAi,
  hardwareInfo,
  localModels,
  localRuntime,
  modelFitsHardware,
  DEFAULT_LOCAL_ENDPOINTS,
} from '../services/localAi';
import { getKeyStatus, removeApiKey, setApiKey, secureStorageAvailable, type KeyStatus } from '../services/aiSecrets';
import { toolCatalogue, READ_TOOLS, WRITE_TOOLS } from '../services/aiToolRegistry';
import type { AiModuleConfig } from '../types';

/**
 * ⚙️ AI SETTINGS
 *
 * Nine tabs covering everything the AI does, plus a per-module screen so each
 * of the seven personas can have its own provider, model, temperature, mode
 * and instructions without disturbing the others.
 */

type Tab = 'general' | 'providers' | 'models' | 'keys' | 'local' | 'privacy' | 'context' | 'usage' | 'advanced';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'providers', label: 'Providers' },
  { key: 'models', label: 'Models' },
  { key: 'keys', label: 'API Keys' },
  { key: 'local', label: 'Local AI' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'context', label: 'Context' },
  { key: 'usage', label: 'Usage' },
  { key: 'advanced', label: 'Advanced' },
];

const PROVIDERS = ['openai', 'anthropic', 'google', 'groq', 'openrouter', 'custom'];

export default function AiSettings() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const save = useData((s) => s.saveSettings);
  const [tab, setTab] = useState<Tab>('general');
  const [status, setStatus] = useState('');

  const ai: Record<string, AiModuleConfig> = settings?.ai ?? {};

  const update = (moduleKey: string, patch: Partial<AiModuleConfig>) => {
    const next = { ...ai, [moduleKey]: { ...(ai[moduleKey] ?? ({} as AiModuleConfig)), ...patch } };
    save({ ...settings, ai: next } as any);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="⚙️ AI Settings"
        subtitle="Each module is configured independently — changing one never affects the others."
        action={
          <button className="btn-secondary" onClick={() => navigate('/settings')}>
            ← All settings
          </button>
        }
      />

      <div className="card">
        <AiStatusDot />
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} ariaLabel="AI settings sections" />

      {status && <div className="card text-sm">{status}</div>}

      {tab === 'general' && <GeneralTab ai={ai} update={update} />}
      {tab === 'providers' && <ProvidersTab ai={ai} update={update} />}
      {tab === 'models' && <ModelsTab ai={ai} update={update} />}
      {tab === 'keys' && <KeysTab ai={ai} update={update} setStatus={setStatus} />}
      {tab === 'local' && <LocalTab ai={ai} update={update} />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'context' && <ContextTab />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'advanced' && <AdvancedTab />}
    </div>
  );
}

// ---- General -----------------------------------------------------------

function GeneralTab({ ai, update }: { ai: Record<string, AiModuleConfig>; update: (k: string, p: Partial<AiModuleConfig>) => void }) {
  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="font-semibold">AI modules</h3>
        <p className="mt-1 text-xs opacity-75">
          Seven assistants share one engine but keep separate personalities and separate configuration.
        </p>
      </div>

      {(Object.keys(PERSONAS) as AiPersona[]).map((p) => {
        const def = PERSONAS[p];
        const cfg = ai[def.configKey] ?? ({} as AiModuleConfig);
        const avail = availability(p);
        return (
          <div className="card space-y-2" key={p}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                {def.icon} {def.label}
              </h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cfg.enabled !== false}
                  onChange={(e) => update(def.configKey, { enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>
            <p className="text-xs opacity-75">{def.system}</p>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs">
                Mode
                <select
                  className="input mt-1 w-full"
                  value={cfg.mode ?? 'auto'}
                  onChange={(e) => update(def.configKey, { mode: e.target.value as any })}
                >
                  <option value="auto">AUTO — local first, then cloud</option>
                  <option value="local">LOCAL ONLY — never calls the cloud</option>
                  <option value="cloud">CLOUD ONLY — never uses local</option>
                </select>
              </label>
              <label className="text-xs">
                Temperature ({cfg.temperature ?? 0.7})
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  className="mt-1 w-full"
                  value={cfg.temperature ?? 0.7}
                  onChange={(e) => update(def.configKey, { temperature: Number(e.target.value) })}
                />
              </label>
              <div className="text-xs">
                Status
                <div className="mt-1">
                  {avail.effective === 'none' ? (
                    <span title={avail.reason}>🔴 Unavailable</span>
                  ) : (
                    <span>{avail.effective === 'local' ? '💻 Local AI' : '☁️ Cloud AI'}</span>
                  )}
                </div>
              </div>
            </div>

            <label className="block text-xs">
              Extra instructions for this module
              <textarea
                className="input mt-1 w-full"
                rows={2}
                placeholder="e.g. Always relate answers back to Ghanaian STG where relevant."
                value={cfg.instructions ?? ''}
                onChange={(e) => update(def.configKey, { instructions: e.target.value })}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ---- Providers ---------------------------------------------------------

function ProvidersTab({ ai, update }: { ai: Record<string, AiModuleConfig>; update: (k: string, p: Partial<AiModuleConfig>) => void }) {
  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">Cloud providers</h3>
      <p className="text-xs opacity-75">
        No provider is hard-coded. Pick one per module, or point “custom” at any OpenAI-compatible endpoint.
      </p>
      {AI_MODULES.map((m) => {
        const cfg = ai[m.key] ?? ({} as AiModuleConfig);
        return (
          <div key={m.key} className="grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3 dark:border-slate-700">
            <div className="text-sm">{m.label}</div>
            <select className="input" value={cfg.provider ?? 'openai'} onChange={(e) => update(m.key, { provider: e.target.value as any })}>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Base URL (optional)"
              value={cfg.baseUrl ?? ''}
              onChange={(e) => update(m.key, { baseUrl: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---- Models ------------------------------------------------------------

function ModelsTab({ ai, update }: { ai: Record<string, AiModuleConfig>; update: (k: string, p: Partial<AiModuleConfig>) => void }) {
  const models = localModels();
  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">Models per module</h3>
      {AI_MODULES.map((m) => {
        const cfg = ai[m.key] ?? ({} as AiModuleConfig);
        return (
          <div key={m.key} className="grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3 dark:border-slate-700">
            <div className="text-sm">{m.label}</div>
            <input
              className="input"
              placeholder="Cloud model, e.g. gpt-4o-mini"
              value={cfg.model ?? ''}
              onChange={(e) => update(m.key, { model: e.target.value })}
            />
            <select className="input" value={cfg.localModel ?? ''} onChange={(e) => update(m.key, { localModel: e.target.value })}>
              <option value="">Local model — first available</option>
              {models.map((lm) => (
                <option key={lm.id} value={lm.id}>
                  {lm.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

// ---- API keys ----------------------------------------------------------

function KeysTab({
  ai,
  update,
  setStatus,
}: {
  ai: Record<string, AiModuleConfig>;
  update: (k: string, p: Partial<AiModuleConfig>) => void;
  setStatus: (s: string) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, KeyStatus>>({});
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [secure, setSecure] = useState(false);

  const reload = async () => {
    const next: Record<string, KeyStatus> = {};
    for (const m of AI_MODULES) next[m.key] = await getKeyStatus(m.key);
    setStatuses(next);
    setSecure(await secureStorageAvailable());
    await refreshKeyCache();
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveKey = async (moduleKey: string) => {
    const value = entry[moduleKey]?.trim();
    if (!value) return;
    await setApiKey(moduleKey, value);
    // Never persist the plaintext into settings.
    if (ai[moduleKey]?.apiKey) update(moduleKey, { apiKey: '' });
    setEntry({ ...entry, [moduleKey]: '' }); // drop it from React state immediately
    await reload();
    setStatus('🔐 Key saved to secure storage.');
  };

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">API keys</h3>
      <div className={`rounded p-2 text-xs ${secure ? 'bg-emerald-500/10' : 'bg-amber-400/10'}`}>
        {secure
          ? '🔐 Keys are encrypted with your operating system’s credential store and can only be decrypted by this app, on this account. They are never written to browser storage, never saved in your records, and never leave the app except in the request itself.'
          : '⚠️ Secure OS storage is unavailable in this build, so keys are kept in memory for this session only and will be forgotten when you close the app. Install the desktop app for permanent, encrypted key storage.'}
      </div>

      {AI_MODULES.map((m) => {
        const st = statuses[m.key];
        const legacy = ai[m.key]?.apiKey?.trim();
        return (
          <div key={m.key} className="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{m.label}</span>
              <span className="text-xs opacity-75">
                {st?.present ? `🔑 Stored ${st.hint ?? ''} (${st.storage === 'os' ? 'OS keychain' : 'session only'})` : 'No key'}
              </span>
            </div>
            {legacy && (
              <div className="rounded bg-amber-400/10 p-1 text-xs">
                ⚠️ A key is still stored in plain settings for this module. Re-enter it below to move it into secure storage.
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              <input
                type="password"
                className="input min-w-40 flex-1"
                placeholder="Paste key — it is never shown again"
                value={entry[m.key] ?? ''}
                onChange={(e) => setEntry({ ...entry, [m.key]: e.target.value })}
              />
              <button className="btn-primary shrink-0" onClick={() => void saveKey(m.key)}>
                Save
              </button>
              <button
                className="btn-secondary shrink-0"
                onClick={async () => {
                  await removeApiKey(m.key);
                  update(m.key, { apiKey: '' });
                  await reload();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Local AI ----------------------------------------------------------

function LocalTab({ ai, update }: { ai: Record<string, AiModuleConfig>; update: (k: string, p: Partial<AiModuleConfig>) => void }) {
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const rt = localRuntime();
  const models = localModels();
  const hw = hardwareInfo();

  const scan = async () => {
    setBusy(true);
    await detectLocalAi(true);
    setBusy(false);
    setTick((t) => t + 1);
  };

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card space-y-3" key={tick}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">💻 Local AI</h3>
        <button className="btn-secondary" disabled={busy} onClick={() => void scan()}>
          {busy ? 'Scanning…' : '🔄 Scan for runtimes'}
        </button>
      </div>

      <p className="text-xs opacity-75">
        Local AI runs entirely on this machine. Nothing leaves the device, it costs nothing, and it works with no internet.
      </p>

      <div className="rounded bg-slate-100 p-2 text-sm dark:bg-slate-700">
        {rt ? (
          <>
            ✅ <strong>{rt.label}</strong> detected at <code>{rt.baseUrl}</code>
          </>
        ) : (
          <>
            ❌ No local runtime detected. Install <strong>Ollama</strong> (ollama.com) or any OpenAI-compatible local server,
            pull a model, then scan again.
          </>
        )}
      </div>

      <div className="text-xs opacity-75">
        Endpoints probed: {DEFAULT_LOCAL_ENDPOINTS.map((e) => e.baseUrl).join(', ')}
      </div>

      <div className="text-xs">
        🖥 Hardware: {hw.cores ? `${hw.cores} CPU threads` : 'CPU unknown'}
        {hw.memoryGb ? ` · ~${hw.memoryGb} GB RAM` : ''}
        {!hw.memoryGb && ' · RAM unknown (the browser does not expose it)'}
      </div>

      <div>
        <h4 className="text-sm font-medium">Installed models ({models.length})</h4>
        {models.length === 0 && <p className="text-xs opacity-70">None found.</p>}
        <ul className="mt-1 space-y-1 text-sm">
          {models.map((m) => {
            const fit = modelFitsHardware(m);
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-1 dark:border-slate-700">
                <span>
                  {m.name}
                  {m.size ? <span className="opacity-70"> · {(m.size / 1e9).toFixed(1)} GB</span> : null}
                  <span className="opacity-70"> · {m.runtime}</span>
                </span>
                {!fit.ok && <span className="text-xs text-amber-600">⚠️ {fit.note}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
        <h4 className="text-sm font-medium">Per-module local model</h4>
        {AI_MODULES.map((m) => (
          <div key={m.key} className="mt-1 grid gap-2 sm:grid-cols-2">
            <span className="text-sm">{m.label}</span>
            <select className="input" value={ai[m.key]?.localModel ?? ''} onChange={(e) => update(m.key, { localModel: e.target.value })}>
              <option value="">First available</option>
              {models.map((lm) => (
                <option key={lm.id} value={lm.id}>
                  {lm.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Privacy -----------------------------------------------------------

function PrivacyTab() {
  return (
    <div className="card space-y-2 text-sm">
      <h3 className="font-semibold">🔒 Privacy</h3>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your records never leave this device unless a cloud module is enabled, has a key, and is actually used for a request.</li>
        <li>When cloud AI runs, only the small set of records retrieved for that one question is sent — never your whole database.</li>
        <li>Local AI sends nothing anywhere. Everything stays on this machine.</li>
        <li>Conversations are stored locally and are never uploaded automatically.</li>
        <li>API keys live in your operating system’s encrypted credential store, never in browser storage or your records.</li>
        <li>No patient-identifying information is ever stored or transmitted — the app has no fields for it by design.</li>
        <li>AI output is stored separately from your own notes, so the two never get confused.</li>
      </ul>
    </div>
  );
}

// ---- Context -----------------------------------------------------------

function ContextTab() {
  return (
    <div className="card space-y-2 text-sm">
      <h3 className="font-semibold">🧠 Context &amp; retrieval</h3>
      <p className="text-xs opacity-75">
        Every question runs through the same pipeline, so the AI sees exactly what it needs and nothing more:
      </p>
      <pre className="overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-700">
{`Query
  → Intent detection      (task type, date range, academic level)
  → Knowledge retrieval   (Intelligence Layer, all modules)
  → Relevance ranking     (keyword, recency, relation, academic context)
  → Relevant context only (top matches, never the whole database)
  → Model
  → Response + sources`}
      </pre>
      <p className="text-xs opacity-75">
        Ranking uses keyword matching, the record selected on screen, recency, and your academic context. The architecture
        leaves room for local embeddings later; deterministic keyword search keeps working with or without them.
      </p>
      <h4 className="pt-2 font-medium">Tools available to the AI</h4>
      <p className="text-xs opacity-75">
        {Object.keys(READ_TOOLS).length} read tools (always allowed) · {Object.keys(WRITE_TOOLS).length} write tools
        (blocked until you press Confirm).
      </p>
      <pre className="max-h-60 overflow-auto rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-700">{toolCatalogue()}</pre>
    </div>
  );
}

// ---- Usage -------------------------------------------------------------

function UsageTab() {
  const [tick, setTick] = useState(0);
  const usage = aiUsage();
  const log = aiLog().slice(0, 40);

  return (
    <div className="space-y-3" key={tick}>
      <div className="card space-y-2">
        <h3 className="font-semibold">📊 Usage</h3>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xl font-semibold">{usage.requests}</div>
            <div className="text-xs opacity-70">requests</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{usage.failures}</div>
            <div className="text-xs opacity-70">failures</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{usage.approxTokens.toLocaleString()}</div>
            <div className="text-xs opacity-70">approx. tokens</div>
          </div>
        </div>
        <p className="text-xs opacity-70">
          Token counts are estimates for your own awareness. The app does not claim exact costs, because it has no pricing data
          for your provider.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Activity log</h3>
          <button
            className="btn-secondary"
            onClick={() => {
              clearAiLog();
              setTick((t) => t + 1);
            }}
          >
            Clear log
          </button>
        </div>
        <p className="mt-1 text-xs opacity-70">API keys are never logged.</p>
        <div className="mt-2 max-h-72 overflow-auto text-xs">
          {log.length === 0 && <p className="opacity-70">No AI activity yet.</p>}
          {log.map((e) => (
            <div key={e.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-200 py-1 dark:border-slate-700">
              <span>
                {e.ok ? '✅' : '❌'} {new Date(e.ts).toLocaleString()} · {e.module} · {e.runtime}
                {e.model ? ` · ${e.model}` : ''}
              </span>
              <span className="opacity-70">
                {e.durationMs} ms{e.approxTokens ? ` · ~${e.approxTokens} tok` : ''}
                {e.contextRecords != null ? ` · ${e.contextRecords} records` : ''}
                {e.error ? ` · ${e.error}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Advanced / diagnostics -------------------------------------------

function AdvancedTab() {
  const [results, setResults] = useState<DiagnosticResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResults(await runDiagnostics());
    setBusy(false);
  };

  const icon = (s: DiagnosticResult['status']) => (s === 'pass' ? '✅ PASS' : s === 'warn' ? '⚠️ WARNING' : '❌ FAIL');

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🔧 AI Diagnostics</h3>
        <button className="btn-primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Testing…' : '[ Test AI ]'}
        </button>
      </div>
      <p className="text-xs opacity-75">Checks every layer and tells you exactly which one is the problem.</p>

      {results && (
        <ul className="space-y-1 text-sm">
          {results.map((r) => (
            <li key={r.name} className="border-t border-slate-200 pt-1 dark:border-slate-700">
              <strong>{icon(r.status)}</strong> · {r.name}
              <div className="text-xs opacity-75">{r.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
