import { useState } from 'react';
import { PageHeader } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { HEALTH_APIS } from '../../services/defaults';
import { useData } from '../../stores/data';
import type { HealthApiKey } from '../../types';

/**
 * 🩺 MY HEALTH APIs
 *
 * A study-help section inside the PharmD Journey. Lists curated open and
 * commercial medical / pharmaceutical data APIs with links, what data they
 * give, and access/compliance notes. API keys are configured here too, and
 * saved into `settings.healthApis` — SEPARATE from the AI LLM keys so they
 * are never sent to an LLM provider.
 */
export default function HealthApisPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const saveSettings = useData((s) => s.saveSettings);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  function update(id: string, patch: Partial<HealthApiKey>) {
    if (!settings) return;
    const apis = { ...(settings.healthApis ?? {}) };
    apis[id] = { ...(apis[id] ?? { name: '', key: '', enabled: false }), ...patch };
    void saveSettings({ ...settings, healthApis: apis, updatedAt: Date.now() });
  }

  function get(id: string): HealthApiKey {
    return settings?.healthApis?.[id] ?? { name: '', key: '', enabled: false };
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="🩺 My Health APIs"
        subtitle="Open &amp; commercial medical data APIs to supercharge your pharmacy studies. Keys are stored separately from your AI keys."
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="health-apis"
              prompt="Give me a quick study tour of my configured Health APIs: for each one (openFDA, RxNav, UMLS, WebMD/RxList) tell me the most useful endpoint for a pharmacy student, an example URL I can paste into my browser, what response fields to pay attention to, and how it helps with revising drugs/interactions/terminology."
            />
            <button className="btn-secondary" onClick={() => navigate('/settings/ai#health-apis')}>
              🔑 Manage keys in Settings
            </button>
            <button className="btn-secondary" onClick={() => navigate('/journey')}>
              ← Journey
            </button>
          </div>
        }
      />

      <div className="card bg-brand-500/10 dark:bg-brand-900/20">
        <p className="text-sm">
          <strong>🎓 For your studies.</strong> These APIs give you real drug labels,
          interactions, terminology (SNOMED CT, ICD-10, RxNorm), and clinical data
          you can look up while studying, building projects, or verifying facts.
          They are <em>separate</em> from your AI provider keys (ChatGPT / Claude /
          OpenRouter) — your AI never sees these keys and they are never sent to
          an LLM.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {HEALTH_APIS.map((api) => {
          const cfg = get(api.id);
          const hasKey = !!cfg.key?.trim();
          return (
            <div key={api.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="text-xl">{api.icon}</span>
                    <a href={api.url} target="_blank" rel="noreferrer" className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
                      {api.name}
                    </a>
                    {cfg.enabled && hasKey && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        ✓ Enabled
                      </span>
                    )}
                    {api.requiresKey && !hasKey && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        🔑 Key required
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs opacity-75">{api.data}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[11px]">
                <div><span className="font-semibold opacity-70">Access:</span> {api.access}</div>
                <div>
                  <span className="font-semibold opacity-70">Docs:</span>{' '}
                  <a href={api.docs} target="_blank" rel="noreferrer" className="text-brand-600 underline-offset-2 hover:underline">
                    {api.docs}
                  </a>
                </div>
              </div>

              <div className="mt-3 rounded border border-slate-200 p-2 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={cfg.enabled}
                      disabled={api.requiresKey && !hasKey}
                      onChange={(e) => update(api.id, { enabled: e.target.checked })}
                    />
                    Enable for study lookups
                  </label>
                  <a className="text-xs text-brand-600 underline-offset-2 hover:underline" href={api.url} target="_blank" rel="noreferrer">
                    Open {api.name} →
                  </a>
                </div>
                <div className="mt-2">
                  <label className="text-[11px] opacity-70">API key {api.requiresKey ? '(required)' : '(optional)'}</label>
                  <div className="flex gap-1">
                    <input
                      type={showKey[api.id] ? 'text' : 'password'}
                      className="input flex-1 !py-1.5 text-xs"
                      placeholder={api.keyPlaceholder}
                      value={cfg.key ?? ''}
                      onChange={(e) => update(api.id, { key: e.target.value })}
                    />
                    <button className="btn-secondary shrink-0 !py-1.5 text-xs" onClick={() => setShowKey({ ...showKey, [api.id]: !showKey[api.id] })}>
                      {showKey[api.id] ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-[11px] opacity-70">Notes (for yourself)</label>
                  <input
                    className="input w-full !py-1.5 text-xs"
                    placeholder="e.g. Registered 2026-09-04, 500 req/day"
                    value={cfg.notes ?? ''}
                    onChange={(e) => update(api.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3 className="mb-1 text-sm font-semibold">📚 Tips for using these while you study</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs opacity-80">
          <li><strong>openFDA</strong> — look up a drug label section (adverse reactions, contraindications) when you are revising a medicine and want the official wording.</li>
          <li><strong>RxNav</strong> — when learning polypharmacy cases, paste a drug list into the interaction endpoint to see pairs worth revising.</li>
          <li><strong>UMLS</strong> — map between terminologies (e.g. SNOMED CT ↔ ICD-10 ↔ RxNorm) when studying classification systems or doing research.</li>
          <li><strong>RxList / WebMD</strong> — pull consumer-friendly monographs to practice translating clinical language into patient counselling ("Drug Talk").</li>
        </ul>
        <p className="mt-2 text-[11px] opacity-60">
          🔒 Keys you enter here are stored only on this device, just like your AI keys. They are excluded from AI context prompts and never sent to an LLM.
        </p>
      </div>
    </div>
  );
}
