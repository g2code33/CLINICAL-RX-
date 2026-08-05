import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import { generateBundle, mergeBundles, processAiQueue, getPendingAiCount, aiAvailable } from '../services/bundler';
import { bundleToMarkdown, bundleToJson, bundleToPdf, downloadText, copyToClipboard } from '../services/export';
import { scanForPhi, privacyWarning } from '../services/privacy';
import { aiChat } from '../services/ai';
import { CloudSyncPrompt } from '../components/CloudSyncPrompt';
import type { Bundle } from '../types';

type Filter = 'all' | 'days' | 'weeks' | 'merged';

const TYPE_LABEL: Record<string, string> = {
  'auto-daily': '🤖 Auto Daily',
  'auto-weekly': '🤖 Auto Weekly',
  'manual-day': '✍️ Manual Day',
  'manual-week': '✍️ Manual Week',
  'manual-custom': '✍️ Manual Custom',
  merged: '🔗 Merged',
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Bundles() {
  const bundles = useData((s) => s.bundles);
  const days = useData((s) => s.days);
  const setStatus = useData((s) => s.setStatus);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewing, setViewing] = useState<Bundle | null>(null);
  const [merging, setMerging] = useState(false);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const pendingAiCount = getPendingAiCount();

  async function processPendingAi() {
    if (!navigator.onLine) {
      setStatus('⚠️ You are offline. Connect to the internet and try again.');
      return;
    }
    if (!aiAvailable()) {
      setStatus('⚠️ Enable the AI Bundler module and add an API key in Settings → AI first.');
      return;
    }
    setStatus('🤖 Processing pending AI bundles…');
    const r = await processAiQueue();
    setStatus(r.processed ? `✓ AI processed ${r.processed} bundle(s)` : 'No pending AI bundles');
  }

  async function doAutoDaily() {
    setStatus('Generating auto daily bundle…');
    const day = days.find((d) => d.date === todayIso());
    await generateBundle({
      type: 'auto-daily',
      title: `AUTO — Daily Bundle — ${todayIso()}`,
      periodStart: todayIso(),
      periodEnd: todayIso(),
      sourceModules: ['day', 'disease', 'medicine', 'investigation', 'question'],
    });
    void day;
    setStatus('✓ Auto daily bundle created');
  }

  async function doAutoWeekly() {
    const end = todayIso();
    const start = addDays(end, -6);
    setStatus('Generating auto weekly bundle…');
    await generateBundle({
      type: 'auto-weekly',
      title: `AUTO — Weekly Bundle — Week ${start}→${end}`,
      periodStart: start,
      periodEnd: end,
      sourceModules: ['day', 'disease', 'medicine', 'investigation', 'question'],
    });
    setStatus('✓ Auto weekly bundle created');
  }

  async function doManual(type: 'manual-day' | 'manual-week' | 'manual-custom', name: string) {
    const end = todayIso();
    const start = type === 'manual-day' ? end : type === 'manual-week' ? addDays(end, -6) : addDays(end, -30);
    setStatus('Creating manual bundle…');
    await generateBundle({ type, title: name, periodStart: start, periodEnd: end });
    setStatus('✓ Manual bundle created');
    setCreateOpen(false);
  }

  async function doMerge() {
    if (selected.length < 1) return;
    setMerging(true);
    setStatus('Merging bundles…');
    const sources = bundles.filter((b) => selected.includes(b.id));
    await mergeBundles(selected, `MERGED — Clinical Review — ${sources.length} bundles`);
    setSelected([]);
    setMerging(false);
    setStatus('✓ Merged bundle created');
  }

  // Group bundles: day-level (periodStart === periodEnd), week-level (span
  // 7 days / auto-weekly / manual-week), and merged (anything with source
  // bundles or type merged).
  const isDay = (b: Bundle) => b.type === 'auto-daily' || b.type === 'manual-day' || (b.periodStart === b.periodEnd && b.type !== 'merged');
  const isWeek = (b: Bundle) => b.type === 'auto-weekly' || b.type === 'manual-week' || (!isDay(b) && b.type !== 'merged');
  const isMerged = (b: Bundle) => b.type === 'merged' || b.sourceBundleIds.length > 0;

  const filtered = bundles.filter((b) => {
    if (query && !b.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'all') return true;
    if (filter === 'days') return isDay(b);
    if (filter === 'weeks') return isWeek(b);
    if (filter === 'merged') return isMerged(b);
    return true;
  });

  // Group days by date, weeks by their start date (descending).
  const dayGroups = new Map<string, Bundle[]>();
  const weekGroups = new Map<string, Bundle[]>();
  const mergedList: Bundle[] = [];
  for (const b of filtered) {
    if (isMerged(b)) { mergedList.push(b); continue; }
    if (isDay(b)) {
      const key = b.periodStart;
      dayGroups.set(key, [...(dayGroups.get(key) || []), b]);
    } else if (isWeek(b)) {
      const key = b.periodStart;
      weekGroups.set(key, [...(weekGroups.get(key) || []), b]);
    }
  }
  const dayKeys = Array.from(dayGroups.keys()).sort().reverse();
  const weekKeys = Array.from(weekGroups.keys()).sort().reverse();

  const hasAuto = bundles.some((b) => b.type.startsWith('auto'));
  const hasManual = bundles.some((b) => b.type.startsWith('manual'));

  return (
    <div>
      <PageHeader
        title="Bundle Library"
        subtitle="Automatic, manual and merged bundles — each stored independently and permanently."
        action={
          <div className="flex flex-wrap gap-2">
            <CloudSyncPrompt />
            {pendingAiCount > 0 && (
              <button className="btn-secondary border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" onClick={processPendingAi} title="Process bundles awaiting AI with the AI Bundler">
                🤖 {pendingAiCount} AI pending
              </button>
            )}
            <button className="btn-secondary" onClick={doAutoDaily}>🤖 Auto Daily</button>
            <button className="btn-secondary" onClick={doAutoWeekly}>🤖 Auto Weekly</button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>＋ Create Bundle</button>
          </div>
        }
      />

      {selected.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50 p-3 dark:border-brand-700 dark:bg-brand-900">
          <span className="text-sm font-semibold text-brand-800 dark:text-brand-200">{selected.length} selected</span>
          <button className="btn-primary !py-1 text-xs" disabled={merging} onClick={doMerge}>🔗 Merge & Analyze</button>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" placeholder="🔍 Search bundles…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-1.5">
          {(['all', 'days', 'weeks', 'merged'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}
            >
              {f === 'days' ? '📅 Days' : f === 'weeks' ? '🗓 Weeks' : f === 'merged' ? '🔗 Merged' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="📦" title="No bundles here" hint={hasAuto || hasManual ? 'Try a different filter, or create a bundle.' : 'Generate an auto bundle or press + Create Bundle to get started.'} />
      ) : (
        <div className="space-y-8">
          {/* DAYS section */}
          {dayKeys.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-bold">📅 Daily bundles</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{dayKeys.length} day(s)</span>
              </div>
              {dayKeys.map((date) => (
                <div key={date} className="mb-4">
                  <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🗓 {date}</span>
                    <span className="text-[11px] text-slate-400">{dayGroups.get(date)!.length} bundle(s)</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dayGroups.get(date)!.map((b) => (
                      <BundleCard key={b.id} b={b} selected={selected.includes(b.id)} onToggle={(v) => setSelected(v ? [...selected, b.id] : selected.filter((x) => x !== b.id))} onOpen={() => setViewing(b)} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* WEEKS section */}
          {weekKeys.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-bold">🗓 Weekly bundles</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{weekKeys.length} week(s)</span>
              </div>
              {weekKeys.map((date) => (
                <div key={date} className="mb-4">
                  <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1 dark:border-slate-700">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🗓 Week of {date}</span>
                    <span className="text-[11px] text-slate-400">{weekGroups.get(date)!.length} bundle(s)</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {weekGroups.get(date)!.map((b) => (
                      <BundleCard key={b.id} b={b} selected={selected.includes(b.id)} onToggle={(v) => setSelected(v ? [...selected, b.id] : selected.filter((x) => x !== b.id))} onOpen={() => setViewing(b)} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* MERGED section */}
          {mergedList.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-bold">🔗 Merged bundles</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{mergedList.length}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {mergedList.map((b) => (
                  <BundleCard key={b.id} b={b} selected={selected.includes(b.id)} onToggle={(v) => setSelected(v ? [...selected, b.id] : selected.filter((x) => x !== b.id))} onOpen={() => setViewing(b)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Bundle card is defined below as BundleCard */}

      {/* Manual create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Manual Bundle">
        <ManualCreate onCreate={doManual} />
      </Modal>

      {/* Bundle detail */}
      {viewing && (
        <BundleDetail
          bundle={viewing}
          onClose={() => { setViewing(null); setAiReply(null); }}
          onOpenBundle={(b) => { setViewing(b); setAiReply(null); }}
        />
      )}
    </div>
  );
}

function BundleCard({ b, selected, onToggle, onOpen }: { b: Bundle; selected: boolean; onToggle: (v: boolean) => void; onOpen: () => void }) {
  return (
    <div className="card flex cursor-pointer flex-col justify-between transition-colors hover:border-brand-400" onClick={onOpen}>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill color={b.type.startsWith('auto') ? 'green' : b.type === 'merged' ? 'slate' : 'amber'}>{TYPE_LABEL[b.type]}</Pill>
            {b.aiPending && <Pill color="amber">🤖 AI pending</Pill>}
          </div>
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100">{b.title}</h3>
        <div className="text-xs text-slate-400">{b.periodStart} → {b.periodEnd}</div>
        <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{b.summary}</p>
        {b.sourceBundleIds.length > 0 && <div className="mt-1 text-[11px] text-slate-400">🔗 Merged from {b.sourceBundleIds.length} bundle(s)</div>}
      </div>
      <span className="btn-secondary mt-3 w-full text-center">Open →</span>
    </div>
  );
}

function ManualCreate({ onCreate }: { onCreate: (type: 'manual-day' | 'manual-week' | 'manual-custom', name: string) => Promise<void> }) {
  const [mode, setMode] = useState<'manual-day' | 'manual-week' | 'manual-custom' | null>(null);
  const [name, setName] = useState('');
  if (!mode) {
    return (
      <div className="space-y-3">
        {([
          { t: 'manual-day', icon: '📅', d: 'Create a bundle for one day' },
          { t: 'manual-week', icon: '📆', d: 'Create a weekly bundle' },
          { t: 'manual-custom', icon: '📦', d: 'Bundle anything you choose' },
        ] as const).map((o) => (
          <button key={o.t} className="card flex w-full items-center gap-3 text-left hover:border-brand-500" onClick={() => setMode(o.t)}>
            <span className="text-2xl">{o.icon}</span>
            <div>
              <div className="font-semibold">{o.t === 'manual-day' ? 'Day' : o.t === 'manual-week' ? 'Week' : 'Custom'} bundle</div>
              <div className="text-xs text-slate-400">{o.d}</div>
            </div>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-500">Name this bundle</div>
      <input autoFocus className="input" placeholder="e.g. My Hypertension Revision" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => setMode(null)}>Back</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => onCreate(mode, name.trim())}>Create Bundle ✓</button>
      </div>
    </div>
  );
}

function BundleDetail({ bundle, onClose, onOpenBundle }: { bundle: Bundle; onClose: () => void; onOpenBundle?: (b: Bundle) => void }) {
  const setStatus = useData((s) => s.setStatus);
  const save = useData((s) => s.save);
  const allBundles = useData((s) => s.bundles);
  const [followUp, setFollowUp] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  const [thinking, setThinking] = useState(false);

  const settings = useData((s) => s.settings);
  const chatCfg = (settings?.ai?.['chat'] && settings.ai['chat'].apiKey)
    ? settings.ai['chat']
    : (Object.values(settings?.ai ?? {}).find((c) => c?.enabled && c?.apiKey) as any) ?? settings?.ai?.['chat'];

  async function duplicate() {
    const copy: Bundle = {
      ...bundle,
      id: crypto.randomUUID ? crypto.randomUUID() : 'b' + Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: `${bundle.title} (copy)`,
      version: 1,
      followUps: [],
      aiPending: bundle.aiPending,
    };
    await save('bundle', copy);
    setStatus('✓ Bundle duplicated');
  }

  async function addFollowUp() {
    const text = followUpText.trim();
    if (!text) return;
    const followUp: Bundle['followUps'][number] = { id: crypto.randomUUID ? crypto.randomUUID() : 'f' + Date.now(), createdAt: Date.now(), content: text };
    await save('bundle', { ...bundle, version: bundle.version + 1, followUps: [...(bundle.followUps ?? []), followUp] });
    setFollowUpText('');
    setStatus('✓ Follow-up saved (v' + (bundle.version + 1) + ')');
  }

  function exportMd() {
    const finding = scanForPhi(bundleToMarkdown(bundle));
    const text = bundleToMarkdown(bundle);
    if (finding.length) {
      alert(`⚠️ Potential patient-identifying info detected (${privacyWarning(finding)}). Please review before sharing. Exporting anyway.`);
    }
    downloadText(`${bundle.title.replace(/[^a-z0-9]/gi, '_')}.md`, text);
  }
  function exportJson() {
    downloadText(`${bundle.title.replace(/[^a-z0-9]/gi, '_')}.json`, bundleToJson(bundle), 'application/json');
  }
  async function exportPdf() {
    const finding = scanForPhi(bundleToMarkdown(bundle));
    if (finding.length) {
      alert(`⚠️ Potential patient-identifying info detected (${privacyWarning(finding)}). Please review before exporting.`);
    }
    setStatus('Exporting PDF…');
    const dataUrl = await bundleToPdf(bundle);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${bundle.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    a.click();
    setStatus('✓ PDF exported');
  }
  async function share() {
    const text = bundleToMarkdown(bundle);
    const finding = scanForPhi(text);
    if (finding.length) {
      alert(`⚠️ Potential patient-identifying info detected (${privacyWarning(finding)}). Review before sharing.`);
    }
    await copyToClipboard(text);
    setStatus('✓ Bundle copied — paste it anywhere to share');
  }
  async function askAI() {
    if (!chatCfg?.apiKey) {
      setStatus('⚠️ Add an API key in Settings → AI → Clinical Chat first.');
      return;
    }
    setThinking(true);
    setStatus('🤖 Clinical AI is thinking…');
    const res = await aiChat(
      chatCfg,
      'You are a clinical learning tutor for a Level 200 pharmacy student. Explain the bundle concisely, identify knowledge gaps and recommend revision.',
      bundleToMarkdown(bundle)
    );
    setThinking(false);
    // Log this AI task to the Chat section so it's viewable in AI → Chat.
    import('../services/aiTools').then((m) => m.logAiTask('chat', `Explain bundle: ${bundle.title}`, res.ok ? res.text : '⚠️ ' + res.error)).catch(() => {});
    if (res.ok) {
      setStatus('✓ AI explained the bundle');
      setFollowUp(res.text);
    } else {
      setStatus('⚠️ ' + res.error);
    }
  }

  return (
    <Modal open onClose={onClose} title={bundle.title} wide>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Pill color="slate">{TYPE_LABEL[bundle.type]}</Pill>
          <Pill color="slate">v{bundle.version}</Pill>
          <span>{bundle.periodStart} → {bundle.periodEnd}</span>
          {bundle.aiModel && <Pill color="brand">AI: {bundle.aiModel}</Pill>}
        </div>
        {bundle.aiPending && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
            🤖 This bundle was created while offline and has a local summary. When you're back online with the AI Bundler configured, it will be enriched with AI — press "Process AI pending" above, or it runs automatically when you reconnect.
          </div>
        )}

        <div>
          <h3 className="label">Summary</h3>
          <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-slate-700">{bundle.summary || 'No summary.'}</div>
        </div>

        {Object.keys(bundle.stats).length > 0 && (
          <div>
            <h3 className="label">Statistics</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(bundle.stats).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-brand-50 p-2 text-center dark:bg-brand-900">
                  <div className="text-lg font-bold text-brand-700 dark:text-brand-300">{v}</div>
                  <div className="text-[11px] text-slate-500">{k}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="label">Knowledge gaps</h3>
            <ul className="space-y-1">
              {bundle.knowledgeGaps.length ? bundle.knowledgeGaps.map((g, i) => <li key={i} className="text-slate-600 dark:text-slate-300">• {g}</li>) : <li className="text-slate-400">None identified.</li>}
            </ul>
          </div>
          <div>
            <h3 className="label">Recommended revision</h3>
            <ul className="space-y-1">
              {bundle.recommendedRevision.length ? bundle.recommendedRevision.map((r, i) => <li key={i} className="text-slate-600 dark:text-slate-300">• {r}</li>) : <li className="text-slate-400">None.</li>}
            </ul>
          </div>
        </div>

        {bundle.highlights.length > 0 && (
          <div>
            <h3 className="label">Highlights</h3>
            <div className="flex flex-wrap gap-1.5">
              {bundle.highlights.map((h, i) => <Pill key={i} color="amber">{h}</Pill>)}
            </div>
          </div>
        )}

        {bundle.sourceBundleIds.length > 0 && (
          <div>
            <h3 className="label">Lineage (merged from)</h3>
            <div className="space-y-1">
              {bundle.sourceBundleIds.map((id) => {
                const src = allBundles.find((b) => b.id === id);
                return (
                  <button
                    key={id}
                    className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-brand-50 dark:bg-slate-700 dark:hover:bg-brand-900"
                    onClick={() => src && onOpenBundle?.(src)}
                  >
                    <span>→</span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{src?.title ?? id}</div>
                      <div className="text-[11px] text-slate-400">{src ? `${TYPE_LABEL[src.type]} · ${src.periodStart} → ${src.periodEnd}` : 'Source bundle'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(bundle.followUps?.length ?? 0) > 0 && (
          <div>
            <h3 className="label">Follow-ups</h3>
            <div className="space-y-2">
              {bundle.followUps!.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-[11px] text-slate-400">{new Date(f.createdAt).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{f.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label className="label">Add a follow-up (bumps version)</label>
          <div className="flex gap-2">
            <input className="input" value={followUpText} placeholder="e.g. Ask AI to explain this better, or add a note…" onChange={(e) => setFollowUpText(e.target.value)} />
            <button className="btn-secondary shrink-0" onClick={addFollowUp}>+ Follow-up</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button className="btn-secondary" onClick={duplicate}>📋 Duplicate</button>
          <button className="btn-secondary" onClick={askAI} disabled={thinking}>{thinking ? '🤖 Thinking…' : '🤖 Ask AI'}</button>
          <button className="btn-secondary" onClick={exportMd}>⬇ Markdown</button>
          <button className="btn-secondary" onClick={exportPdf}>⬇ PDF</button>
          <button className="btn-secondary" onClick={exportJson}>⬇ JSON</button>
          <button className="btn-primary" onClick={share}>📤 Share / Copy</button>
        </div>

        {followUp && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-slate-700 dark:border-brand-700 dark:bg-brand-900 dark:text-slate-200">
            <div className="mb-1 font-semibold">🤖 AI response</div>
            <div className="whitespace-pre-wrap">{followUp}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
