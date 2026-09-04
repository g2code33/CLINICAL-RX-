import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { useData } from '../../stores/data';
import { openFda, rxNav, umls, webmd } from '../../services/healthApiClients';

type TabId = 'openfda' | 'rxnav' | 'umls' | 'webmd';

const TABS: { id: TabId; icon: string; label: string; color: string }[] = [
  { id: 'openfda', icon: '💊', label: 'openFDA', color: 'from-sky-500 to-cyan-500' },
  { id: 'rxnav',   icon: '🔗', label: 'RxNav',   color: 'from-emerald-500 to-teal-500' },
  { id: 'umls',    icon: '📖', label: 'UMLS',    color: 'from-violet-500 to-fuchsia-500' },
  { id: 'webmd',   icon: '🌐', label: 'RxList/WebMD', color: 'from-orange-500 to-rose-500' },
];

const SEVERITY_COLORS: Record<string, string> = {
  'high': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  'severe': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  'major': 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
  'moderate': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  'minor': 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  'n/a': 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export default function HealthApisPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const [tab, setTab] = useState<TabId>('openfda');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultKind, setResultKind] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [directUrl, setDirectUrl] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);

  const keys = useMemo(() => settings?.healthApis ?? {}, [settings?.healthApis]);
  const hasKey = (id: string) => !!(keys[id]?.key?.trim() && keys[id]?.enabled);

  function resetResult() { setResult(null); setResultKind(''); setErr(''); setDirectUrl(''); setShowRaw(false); }

  async function run<T>(p: Promise<T>, kind: string) {
    setBusy(true); setErr(''); setResult(null); setDirectUrl(''); setShowRaw(false);
    try {
      const r = await p as any;
      if (!r.ok) { setErr(r.error || 'Request failed'); setDirectUrl(r.url || ''); return; }
      setResult(r.data); setResultKind(kind); setDirectUrl(r.url || '');
    } catch (e: any) { setErr(e?.message || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="🩺 My Health APIs"
        subtitle="⚡ Fast lookups on real clinical & pharmaceutical data for study. Manage keys in ⚙️ Settings."
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="health-apis"
              prompt="Using my configured Health APIs, help me study: suggest how to combine openFDA, RxNav and UMLS to verify a drug fact, give example queries, and point out licensing limits."
            />
            <button className="btn-secondary" onClick={() => navigate('/settings?section=healthApis')}>⚙️ Keys</button>
            <button className="btn-secondary" onClick={() => navigate('/journey')}>← Journey</button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const needKey = t.id === 'umls';
          const ready = !needKey || hasKey(t.id);
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); resetResult(); }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? `border-transparent bg-gradient-to-r ${t.color} text-white shadow-sm`
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {!ready && <span className="ml-0.5 rounded-full bg-white/25 px-1 text-[9px]">🔑</span>}
            </button>
          );
        })}
      </div>

      {/* Busy indicator */}
      {busy && (
        <div className="card flex items-center gap-2 text-sm">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span className="font-semibold">Fetching…</span>
          <span className="opacity-60">live API call — usually under a second.</span>
        </div>
      )}

      {/* Panels */}
      {tab === 'openfda' && <OpenFdaPanel busy={busy} run={run} keys={keys} />}
      {tab === 'rxnav' && <RxNavPanel busy={busy} run={run} />}
      {tab === 'umls' && <UmlsPanel busy={busy} run={run} umlsKey={keys.umls?.key ?? ''} />}
      {tab === 'webmd' && <WebMdPanel />}

      {/* Error */}
      {err && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <div className="font-bold">⚠️ {err}</div>
          {directUrl && (
            <a className="mt-2 inline-block rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700" href={directUrl} target="_blank" rel="noreferrer">
              Open URL in new tab ↗
            </a>
          )}
        </div>
      )}

      {/* Result */}
      {result && !busy && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">📋 Results</div>
            <div className="flex items-center gap-2 text-xs">
              {directUrl && <a className="rounded bg-brand-600 px-2 py-1 font-semibold text-white hover:bg-brand-700" href={directUrl} target="_blank" rel="noreferrer">Raw JSON ↗</a>}
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >{showRaw ? 'Hide raw' : 'View raw'}</button>
            </div>
          </div>
          {showRaw ? (
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-200">{JSON.stringify(result, null, 2).slice(30000)}</pre>
          ) : (
            <ResultViewer data={result} kind={resultKind} url={directUrl} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- openFDA ---------- */
function OpenFdaPanel({ busy, run, keys }: { busy: boolean; run: (p: Promise<any>, k: string) => void; keys: Record<string, any> }) {
  const [drug, setDrug] = useState('');
  const q = drug.trim();
  const canGo = !!q && !busy;
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">💊 openFDA — U.S. Food & Drug Administration</div>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-48 flex-1"
          placeholder="Drug (generic works fastest) — e.g. amlodipine, metformin"
          value={drug}
          onChange={(e) => setDrug(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canGo && run(openFda.searchLabels(q, () => keys, 3), 'openfda-label')}
        />
        <button className="btn-primary" disabled={!canGo} onClick={() => run(openFda.searchLabels(q, () => keys, 3), 'openfda-label')}>
          🔎 Drug label
        </button>
        <button className="bg-rose-600 text-white px-3 py-2 rounded-lg font-semibold text-sm hover:bg-rose-700 disabled:opacity-40" disabled={!canGo} onClick={() => run(openFda.adverseEvents(q, () => keys, 10), 'openfda-ae')}>
          ⚠️ Adverse reactions
        </button>
        <button className="bg-orange-600 text-white px-3 py-2 rounded-lg font-semibold text-sm hover:bg-orange-700 disabled:opacity-40" disabled={!canGo} onClick={() => run(openFda.recalls(q, () => keys, 5), 'openfda-recall')}>
          🚨 Recalls
        </button>
      </div>
      <p className="text-[11px] opacity-60">Generic name = faster, more accurate results (e.g. <b>amLODIPine</b>, not "Norvasc").</p>
    </div>
  );
}

/* ---------- RxNav ---------- */
function RxNavPanel({ busy, run }: { busy: boolean; run: (p: Promise<any>, k: string) => void }) {
  const [drugs, setDrugs] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  function add() { const v = draft.trim(); if (v) { setDrugs([...drugs, v]); setDraft(''); } }
  function remove(i: number) { setDrugs(drugs.filter((_, j) => j !== i)); }

  function checkInteractions() {
    if (drugs.length < 2) { run(Promise.resolve({ ok: false, error: 'Add at least 2 drugs to check interactions.' }), ''); return; }
    run((async () => {
      // Resolve ALL drugs in parallel for speed
      const resolved = await Promise.all(
        drugs.map(async (d) => {
          const r = await rxNav.findRxCui(d) as any;
          return { name: d, cui: r?.idGroup?.rxnormId?.[0] || null };
        })
      );
      const cuis = resolved.filter((x) => x.cui).map((x) => x.cui!);
      const unresolved = resolved.filter((x) => !x.cui).map((x) => x.name);
      if (cuis.length < 2) {
        return { ok: false, error: `Could not resolve to RxNorm: ${unresolved.join(', ')}. Try generic names.` };
      }
      const ir = await rxNav.interactions(cuis) as any;
      if (!ir.ok) return ir;
      return { ok: true, data: { ...ir.data, _resolved: resolved }, url: rxNav.interactionUrl(cuis) };
    })(), 'rxnav-ddi');
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">🔗 RxNav — NIH/NLM drug-drug interactions</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Add a drug (generic) — press Enter" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn-secondary" onClick={add} disabled={!draft.trim()}>＋ Add</button>
        <button className="btn-primary" disabled={busy || drugs.length < 2} onClick={checkInteractions}>
          🔗 Check interactions
        </button>
      </div>
      {drugs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {drugs.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              💊 {d}
              <button onClick={() => remove(i)} className="text-emerald-700 hover:text-red-600 dark:text-emerald-300">✕</button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] opacity-60">All drug lookups run <b>in parallel</b> for speed. No key required.</p>
    </div>
  );
}

/* ---------- UMLS ---------- */
function UmlsPanel({ busy, run, umlsKey }: { busy: boolean; run: (p: Promise<any>, k: string) => void; umlsKey: string }) {
  const [term, setTerm] = useState('');
  const [sab, setSab] = useState('');
  if (!umlsKey?.trim()) {
    return (
      <div className="card">
        <div className="text-sm font-semibold text-violet-700 dark:text-violet-300">🔑 UMLS needs a UTS API key</div>
        <p className="mt-2 text-sm">Add your free UTS key in <b>⚙️ Settings → Health APIs</b> to search SNOMED CT / ICD-10 / RxNorm / MeSH.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => (window as any).location.hash = '#/settings?section=healthApis'}>⚙️ Go to Settings</button>
          <a className="btn-primary" href="https://uts.nlm.nih.gov/uts/" target="_blank" rel="noreferrer">Get free UMLS account →</a>
        </div>
      </div>
    );
  }
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">📖 UMLS — Unified Medical Language System (NLM)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Term (e.g. hypertension, STEMI, amlodipine)" value={term} onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && term.trim() && run(umls.searchConcept(term.trim(), sab, umlsKey, 15), 'umls')} />
        <select className="input" value={sab} onChange={(e) => setSab(e.target.value)}>
          <option value="">All vocabularies</option>
          <option value="SNOMEDCT_US">SNOMED CT (US)</option>
          <option value="ICD10CM">ICD-10-CM</option>
          <option value="RXNORM">RxNorm</option>
          <option value="MSH">MeSH</option>
          <option value="MDR">MedDRA</option>
        </select>
        <button className="btn-primary" disabled={busy || !term.trim()} onClick={() => run(umls.searchConcept(term.trim(), sab, umlsKey, 15), 'umls')}>
          📖 Search
        </button>
      </div>
    </div>
  );
}

/* ---------- WebMD/RxList ---------- */
function WebMdPanel() {
  const [query, setQuery] = useState('');
  const [drugs, setDrugs] = useState<string[]>([]);
  const [d, setD] = useState('');
  function addDrug() { const v = d.trim(); if (v) { setDrugs([...drugs, v]); setD(''); } }
  const q = query.trim();
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-300">🌐 RxList / WebMD — patient-friendly monographs</div>
      <p className="text-xs opacity-75">WebMD has no public JSON API, so Clinical Rx builds one-click deep links. Opens in a new tab — great for <b>Drug Talk</b> practice.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug or condition" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q && window.open(webmd.drugSearchUrl(q), '_blank')} />
        <a className="btn-primary" target="_blank" rel="noreferrer" href={q ? webmd.drugSearchUrl(q) : '#'}>📘 Drug monograph</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={q ? webmd.conditionSearchUrl(q) : '#'}>🔍 Condition</a>
      </div>
      <div>
        <div className="label mb-1">Interaction checker</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder="Drug name" value={d} onChange={(e) => setD(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addDrug(); }} />
          <button className="btn-secondary" disabled={!d.trim()} onClick={addDrug}>＋ Add</button>
        </div>
        {drugs.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {drugs.map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">
                  💊 {x} <button onClick={() => setDrugs(drugs.filter((_, j) => j !== i))} className="text-orange-700 hover:text-red-600">✕</button>
                </span>
              ))}
            </div>
            <a className="btn-primary mt-2 inline-block" target="_blank" rel="noreferrer" href={webmd.interactionsCheckUrl(drugs)}>
              ⚠️ Open RxList interaction checker
            </a>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Result dispatch ---------- */
function ResultViewer({ data, kind }: { data: any; kind: string; url: string }) {
  if (kind === 'openfda-ae' || data?.results?.[0]?.term) return <AdverseEventResults counts={data.results} total={data.meta?.results?.total} />;
  if (kind === 'openfda-recall' || data?.results?.[0]?.reason_for_recall) return <RecallResults results={data.results} total={data.meta?.results?.total} />;
  if (kind === 'openfda-label' || data?.results?.[0]?.indications_and_usage) return <LabelResults results={data.results} total={data.meta?.results?.total} />;
  if (kind === 'rxnav-ddi' || data?.interactionTypeGroup) return <DdiResults data={data} />;
  if (kind === 'umls' || data?.result?.results) return <UmlsResults results={data.result.results} />;
  // Fallback — try to detect
  if (Array.isArray(data?.results)) {
    const first = data.results[0];
    if (first?.term && first?.count) return <AdverseEventResults counts={data.results} />;
    if (first?.reason_for_recall) return <RecallResults results={data.results} />;
    if (first?.indications_and_usage) return <LabelResults results={data.results} />;
  }
  return null;
}

/* ---------- Section card ---------- */
function Section({ title, children, tone = 'slate' }: { title: string; children: React.ReactNode; tone?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'pink' | 'slate' | 'teal' }) {
  if (!children || (Array.isArray(children) && children.every((c) => !c))) return null;
  const tones: Record<string, string> = {
    blue:   'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30',
    green:  'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
    red:    'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
    amber:  'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    purple: 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30',
    pink:   'border-pink-200 bg-pink-50 dark:border-pink-900 dark:bg-pink-950/30',
    slate:  'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40',
    teal:   'border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/30',
  };
  const titleTone: Record<string, string> = {
    blue:   'text-sky-700 dark:text-sky-300',
    green:  'text-emerald-700 dark:text-emerald-300',
    red:    'text-red-700 dark:text-red-300',
    amber:  'text-amber-700 dark:text-amber-300',
    purple: 'text-violet-700 dark:text-violet-300',
    pink:   'text-pink-700 dark:text-pink-300',
    slate:  'text-slate-700 dark:text-slate-300',
    teal:   'text-teal-700 dark:text-teal-300',
  };
  return (
    <div className={`rounded-xl border-2 p-3 ${tones[tone]}`}>
      <div className={`mb-1.5 text-[11px] font-black uppercase tracking-widest ${titleTone[tone]}`}>● {title}</div>
      <div className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  );
}

function cleanText(s: string, max = 700) {
  if (!s) return '';
  // Strip FDA all-caps section headers for cleaner reading
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

function first(arr?: string[]) { return arr?.[0] || ''; }

/* ---------- openFDA label ---------- */
function LabelResults({ results, total }: { results: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow">
        💊 {total ?? results.length} FDA label(s)
      </div>
      {results.slice(0, 2).map((r, i) => {
        const brand = r.openfda?.brand_name?.[0] || '';
        const generic = r.openfda?.generic_name?.[0] || 'Drug';
        const route = r.openfda?.route?.[0];
        const form = r.openfda?.dosage_form?.[0];
        const manu = r.openfda?.manufacturer_name?.[0];
        return (
          <div key={i} className="card space-y-2.5">
            <div className="border-b border-slate-200 pb-2 dark:border-slate-700">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {brand ? <span className="text-sky-600 dark:text-sky-400">{brand}</span> : <span className="text-sky-600 dark:text-sky-400">{generic}</span>}
                {brand && <span className="ml-2 text-sm font-normal text-slate-500">({generic})</span>}
              </h3>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                {route && <Pill tone="blue">{route}</Pill>}
                {form && <Pill tone="teal">{form}</Pill>}
                {r.openfda?.substance_name?.[0] && <Pill tone="purple">{r.openfda.substance_name[0]}</Pill>}
                {r.openfda?.rxcui?.[0] && <Pill tone="slate">RxCUI {r.openfda.rxcui[0]}</Pill>}
              </div>
              {manu && <div className="mt-1 text-[11px] opacity-70">🏭 {manu}</div>}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Section title="Indications & usage" tone="blue"><p>{cleanText(first(r.indications_and_usage), 800)}</p></Section>
              <Section title="Dosage & administration" tone="green"><p>{cleanText(first(r.dosage_and_administration), 800)}</p></Section>
              <Section title={r.boxed_warning?.[0] ? '⚠️ BOXED WARNING' : 'Warnings'} tone="red">
                <p className="font-semibold">{cleanText(first(r.boxed_warning) || first(r.warnings), 900)}</p>
              </Section>
              <Section title="Contraindications" tone="red"><p>{cleanText(first(r.contraindications), 600)}</p></Section>
              <Section title="Adverse reactions" tone="amber"><p>{cleanText(first(r.adverse_reactions), 800)}</p></Section>
              <Section title="Drug interactions" tone="purple"><p>{cleanText(first(r.drug_interactions), 700)}</p></Section>
              <Section title="Pregnancy / lactation" tone="pink"><p>{cleanText((first(r.pregnancy) || first(r.lactation)), 600)}</p></Section>
              <Section title="Patient counselling 🗣️" tone="teal"><p>{cleanText(first(r.patient_medication_information) || first(r.information_for_patients), 800)}</p></Section>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'pink' | 'slate' | 'teal' }) {
  const tones: Record<string, string> = {
    blue:   'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    green:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    red:    'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    amber:  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    purple: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
    pink:   'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200',
    slate:  'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
    teal:   'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  };
  return <span className={`rounded-full px-2 py-0.5 font-bold ${tones[tone]}`}>{children}</span>;
}

/* ---------- Adverse events ---------- */
function AdverseEventResults({ counts, total }: { counts: { term: string; count: number }[]; total?: number }) {
  const max = Math.max(...counts.map((c) => c.count), 1);
  const top = counts[0];
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-sm font-bold text-white shadow">
        ⚠️ Top adverse reactions (FAERS) {total ? `· ${total.toLocaleString()}+ reports` : ''}
      </div>
      <div className="card">
        <div className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <b>FAERS reports are spontaneous and not proof of causation.</b> Use for hypothesis generation; confirm with the label & a reference.
        </div>
        <div className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">🏆 #1 reported: <span className="text-rose-600 dark:text-rose-400">{top?.term}</span> ({top?.count.toLocaleString()})</div>
        <ul className="space-y-1.5">
          {counts.slice(0, 12).map((c, i) => {
            const pct = (c.count / max) * 100;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-center text-xs font-bold opacity-70">{medal}</span>
                <span className="w-44 truncate font-semibold">{c.term}</span>
                <span className="flex-1 rounded-full bg-slate-100 dark:bg-slate-700">
                  <span className="block h-3 rounded-full bg-gradient-to-r from-rose-500 to-red-500" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-16 text-right text-xs font-bold tabular-nums opacity-80">{c.count.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Recalls ---------- */
function RecallResults({ results, total }: { results: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-orange-600 to-red-600 px-4 py-2 text-sm font-bold text-white shadow">
        🚨 {total ?? results.length} recall/enforcement report(s)
      </div>
      {results.slice(0, 6).map((r, i) => {
        const cls = (r.classification || '').toLowerCase();
        const tone = cls.includes('i') ? 'red' : cls.includes('ii') ? 'amber' : cls.includes('iii') ? 'slate' : 'slate';
        return (
          <div key={i} className={`card border-l-4 ${tone === 'red' ? 'border-l-red-500' : tone === 'amber' ? 'border-l-amber-500' : 'border-l-slate-400'}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-base font-black">{r.product_description?.split(';')[0] || 'Recalled product'}</span>
              {r.classification && <Pill tone={tone as any}>Class {r.classification.replace('Class ', '')}</Pill>}
              {r.status && <Pill tone="slate">{r.status}</Pill>}
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] font-semibold opacity-80">
              {r.recalling_firm && <span>🏭 {r.recalling_firm}</span>}
              {r.report_date && <span>📅 {r.report_date}</span>}
              {r.state && <span>📍 {r.state}</span>}
            </div>
            <div className="text-sm"><b className="text-red-700 dark:text-red-400">Reason:</b> {cleanText(r.reason_for_recall, 600)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- DDI ---------- */
function DdiResults({ data }: { data: any }) {
  type Pair = { severity: string; pair: string[]; description: string };
  const pairs: Pair[] = [];
  const resolved: { name: string; cui: string | null }[] = data._resolved || [];
  for (const g of data.interactionTypeGroup ?? []) {
    for (const t of g.interactionType ?? []) {
      for (const p of t.interactionPair ?? []) {
        const names = (p.interactionConcept ?? []).map((c: any) => c.minConceptItem?.name || c.sourceConceptItem?.name || '?');
        pairs.push({ severity: t.interactionType || p.severity || 'N/A', pair: names, description: p.description || '' });
      }
    }
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow">
        🔗 {pairs.length} interaction(s) found for {resolved.filter(r => r.cui).length}/{resolved.length} drugs
      </div>
      {resolved.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-bold opacity-70">Drugs checked:</div>
          <div className="flex flex-wrap gap-1.5">
            {resolved.map((r, i) => (
              <Pill key={i} tone={r.cui ? 'green' : 'red'}>{r.cui ? '✓' : '✕'} {r.name} {r.cui ? <span className="opacity-60">({r.cui})</span> : '— not found'}</Pill>
            ))}
          </div>
        </div>
      )}
      {pairs.length === 0 ? (
        <div className="card rounded-xl border-2 border-emerald-300 bg-emerald-50 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <b className="text-emerald-800 dark:text-emerald-300">✓ No interactions returned by RxNav.</b>
          <p className="mt-1 text-xs opacity-80">This is not a guarantee of safety — always check BNF/AHFS/your formulary.</p>
        </div>
      ) : (
        pairs.map((p, i) => {
          const sev = (p.severity || '').toLowerCase();
          const sevKey = Object.keys(SEVERITY_COLORS).find((k) => sev.includes(k)) || 'n/a';
          const cls = SEVERITY_COLORS[sevKey];
          return (
            <div key={i} className={`rounded-xl border-2 p-3 ${cls}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-black uppercase dark:bg-black/30">{p.severity}</span>
                <span className="font-bold">{p.pair.join(' ⟷ ')}</span>
              </div>
              <p className="text-[13px] leading-relaxed">{p.description}</p>
            </div>
          );
        })
      )}
      <div className="rounded-lg bg-slate-100 p-2 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        📚 Educational use only. Verify with your hospital's formulary, BNF/AHFS, and ask your preceptor.
      </div>
    </div>
  );
}

/* ---------- UMLS ---------- */
function UmlsResults({ results }: { results: any[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow">
        📖 {results.length} UMLS concept(s)
      </div>
      <div className="card space-y-2">
        {results.slice(0, 20).map((r: any, i: number) => (
          <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">{i + 1}. {r.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                {r.ui && <Pill tone="purple">CUI {r.ui}</Pill>}
                {r.rootSource && <Pill tone="slate">{r.rootSource}</Pill>}
              </div>
            </div>
            {r.uri && <a className="text-xs font-bold text-violet-600 hover:underline" href={r.uri} target="_blank" rel="noreferrer">↗</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
