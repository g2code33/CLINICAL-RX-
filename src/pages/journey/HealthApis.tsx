import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { HEALTH_APIS } from '../../services/defaults';
import { useData } from '../../stores/data';
import { openFda, rxNav, umls, webmd } from '../../services/healthApiClients';

type TabId = 'openfda' | 'rxnav' | 'umls' | 'webmd';

const TABS: { id: TabId; icon: string; label: string; blurb: string }[] = [
  { id: 'openfda', icon: '💊', label: 'openFDA', blurb: 'Official FDA drug labels, adverse events, and recalls' },
  { id: 'rxnav',   icon: '🔗', label: 'RxNav (NLM)', blurb: 'Drug-to-drug interactions and RxNorm identifier lookups' },
  { id: 'umls',    icon: '📖', label: 'UMLS', blurb: 'SNOMED CT / ICD-10 / RxNorm terminology search' },
  { id: 'webmd',   icon: '🌐', label: 'RxList / WebMD', blurb: 'Consumer-friendly drug monographs & interaction checker' },
];

export default function HealthApisPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const [tab, setTab] = useState<TabId>('openfda');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string>('');
  const [directUrl, setDirectUrl] = useState<string>('');

  const keys = useMemo(() => settings?.healthApis ?? {}, [settings?.healthApis]);
  const getKeys = () => keys;
  const hasKey = (id: string) => !!(keys[id]?.key?.trim() && keys[id]?.enabled);

  function resetResult() { setResult(null); setErr(''); setDirectUrl(''); }

  async function run<T>(p: Promise<T>) {
    setBusy(true); setErr(''); setResult(null); setDirectUrl('');
    try {
      const r = await p as any;
      if (!r.ok) { setErr(r.error || 'Request failed'); setDirectUrl(r.url || ''); return; }
      setResult(r.data); setDirectUrl(r.url || '');
    } catch (e: any) { setErr(e?.message || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="🩺 My Health APIs"
        subtitle="Live lookups from real clinical & pharmaceutical data APIs to help your studies. Configure keys in ⚙️ Settings → Health APIs."
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="health-apis"
              prompt="Using my configured Health APIs, help me study: suggest how to combine openFDA, RxNav and UMLS to verify a drug fact, give example queries, and point out licensing limits."
            />
            <button className="btn-secondary" onClick={() => navigate('/settings?section=healthApis')}>
              ⚙️ Settings
            </button>
            <button className="btn-secondary" onClick={() => navigate('/journey')}>
              ← Journey
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const needKey = t.id === 'umls';
          const ready = !needKey || hasKey(t.id);
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); resetResult(); }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                tab === t.id
                  ? 'border-brand-500 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {t.icon} {t.label}
              {!ready && <span className="rounded-full bg-amber-100 px-1 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🔑</span>}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {tab === 'openfda' && <OpenFdaPanel busy={busy} run={run} />}
      {tab === 'rxnav' && <RxNavPanel busy={busy} run={run} />}
      {tab === 'umls' && <UmlsPanel busy={busy} run={run} umlsKey={keys.umls?.key ?? ''} />}
      {tab === 'webmd' && <WebMdPanel />}

      {/* Result */}
      {err && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          ⚠️ {err}
          {directUrl && (
            <div className="mt-2">
              <a className="underline" href={directUrl} target="_blank" rel="noreferrer">Open URL directly ↗</a>
            </div>
          )}
        </div>
      )}
      {result && <ResultViewer data={result} url={directUrl} />}
    </div>
  );
}

/* ---------- openFDA ---------- */
function OpenFdaPanel({ busy, run }: { busy: boolean; run: (p: Promise<any>) => void }) {
  const [drug, setDrug] = useState('');
  return (
    <div className="card space-y-3">
      <p className="text-xs opacity-75">
        Official FDA drug labels, adverse-event counts, and enforcement recalls. Add an optional api.data.gov key in Settings for higher rate limits.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-40 flex-1" placeholder="Drug name (e.g. amlodipine, metformin)" value={drug} onChange={(e) => setDrug(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && drug.trim() && run(openFda.searchLabels(drug.trim(), () => ({})))} />
        <button className="btn-primary" disabled={busy || !drug.trim()} onClick={() => run(openFda.searchLabels(drug.trim(), () => ({})))}>
          {busy ? '…' : '🔎 Drug label'}
        </button>
        <button className="btn-secondary" disabled={busy || !drug.trim()} onClick={() => run(openFda.adverseEvents(drug.trim(), () => ({})))}>
          ⚠️ Top adverse reactions
        </button>
        <button className="btn-secondary" disabled={busy || !drug.trim()} onClick={() => run(openFda.recalls(drug.trim(), () => ({})))}>
          🚨 Recalls
        </button>
      </div>
      <p className="text-[11px] opacity-60">Tip: "Drug label" pulls indications, dosage, warnings, contraindications and patient counselling.</p>
    </div>
  );
}

/* ---------- RxNav ---------- */
function RxNavPanel({ busy, run }: { busy: boolean; run: (p: Promise<any>) => void }) {
  const [drugs, setDrugs] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v) { setDrugs([...drugs, v]); setDraft(''); }
  }
  function remove(i: number) { setDrugs(drugs.filter((_, j) => j !== i)); }

  function checkInteractions() {
    if (drugs.length < 2) {
      run(Promise.resolve({ ok: false, error: 'Add at least two drugs to check interactions.' }));
      return;
    }
    run((async () => {
      const cuis: string[] = [];
      const unresolved: string[] = [];
      for (const d of drugs) {
        const r = await rxNav.findRxCui(d) as any;
        const id = r?.idGroup?.rxnormId?.[0];
        if (id) cuis.push(id);
        else unresolved.push(d);
      }
      if (cuis.length < 2) {
        return { ok: false, error: `Could not resolve drug names to RxNorm${unresolved.length ? ': ' + unresolved.join(', ') : ''}. Try generic names (e.g. "amLODIPine" or "atorvastatin").` };
      }
      const ir = await rxNav.interactions(cuis) as any;
      if (!ir.ok) return ir;
      return { ok: true, data: ir.data, url: rxNav.interactionUrl(cuis) };
    })());
  }

  return (
    <div className="card space-y-3">
      <p className="text-xs opacity-75">
        RxNav maps drug names to RxNorm IDs and finds drug-drug interactions. No key needed.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-40 flex-1" placeholder="Add a drug (generic works best) — press Enter" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn-secondary" onClick={add} disabled={!draft.trim()}>＋ Add</button>
        <button className="btn-primary" disabled={busy || drugs.length < 2} onClick={checkInteractions}>
          {busy ? 'Checking…' : '🔗 Check interactions'}
        </button>
      </div>
      {drugs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {drugs.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">
              💊 {d}
              <button onClick={() => remove(i)} className="text-red-500">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- UMLS ---------- */
function UmlsPanel({ busy, run, umlsKey }: { busy: boolean; run: (p: Promise<any>) => void; umlsKey: string }) {
  const [term, setTerm] = useState('');
  const [sab, setSab] = useState('');
  if (!umlsKey?.trim()) {
    return (
      <div className="card">
        <p className="text-sm">🔑 Add your UMLS UTS API key in <a className="underline" href="#/settings?section=healthApis">⚙️ Settings → Health APIs</a> to search SNOMED CT / ICD-10 / RxNorm.</p>
        <a className="btn-secondary mt-3 inline-block" href="https://uts.nlm.nih.gov/uts/" target="_blank" rel="noreferrer">Get a free UMLS account →</a>
      </div>
    );
  }
  return (
    <div className="card space-y-3">
      <p className="text-xs opacity-75">Search the Unified Medical Language System — maps between SNOMED CT, ICD-10, RxNorm, MeSH and more.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-40 flex-1" placeholder="Term (e.g. hypertension, amlodipine)" value={term} onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && term.trim() && run(umls.searchConcept(term.trim(), sab, umlsKey))} />
        <select className="input" value={sab} onChange={(e) => setSab(e.target.value)}>
          <option value="">All vocabularies</option>
          <option value="SNOMEDCT_US">SNOMED CT (US)</option>
          <option value="ICD10CM">ICD-10-CM</option>
          <option value="RXNORM">RxNorm</option>
          <option value="MSH">MeSH</option>
          <option value="MDR">MedDRA</option>
        </select>
        <button className="btn-primary" disabled={busy || !term.trim()} onClick={() => run(umls.searchConcept(term.trim(), sab, umlsKey))}>
          {busy ? '…' : '📖 Search'}
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
  return (
    <div className="card space-y-3">
      <p className="text-xs opacity-75">
        RxList / WebMD doesn't expose a public JSON API — so Clinical Rx opens their consumer pages directly (monographs and interaction checker), perfect for practicing patient-friendly "Drug Talk".
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-40 flex-1" placeholder="Drug or condition" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && query.trim() && window.open(webmd.drugSearchUrl(query.trim()), '_blank')} />
        <a className="btn-primary" target="_blank" rel="noreferrer" href={query.trim() ? webmd.drugSearchUrl(query.trim()) : '#'}>📘 Open monograph</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={query.trim() ? webmd.conditionSearchUrl(query.trim()) : '#'}>🔍 Condition search</a>
      </div>
      <div>
        <div className="label mb-1">Interaction checker</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-40 flex-1" placeholder="Drug name" value={d} onChange={(e) => setD(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addDrug(); }} />
          <button className="btn-secondary" disabled={!d.trim()} onClick={addDrug}>＋ Add</button>
        </div>
        {drugs.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {drugs.map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">
                  💊 {x} <button onClick={() => setDrugs(drugs.filter((_, j) => j !== i))} className="text-red-500">✕</button>
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

/* ---------- Result viewer ---------- */
function ResultViewer({ data, url }: { data: any; url: string }) {
  if (data?.interactionTypeGroup) return <RxNavInteractions data={data} url={url} />;
  if (data?.result?.results) return <UmlsResults results={data.result.results} url={url} />;
  if (Array.isArray(data?.results)) {
    const first = data.results[0];
    const isAdverse = first && ('term' in first) && ('count' in first);
    const isRecall = first && ('reason_for_recall' in first || 'recall_number' in first || 'product_description' in first);
    if (isAdverse) return <AdverseEventResults counts={data.results} url={url} />;
    if (isRecall) return <RecallResults results={data.results} url={url} meta={data.meta} />;
    return <OpenFdaLabelResults results={data.results} url={url} meta={data.meta} />;
  }
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="opacity-70">Raw JSON response</span>
        {url && <a className="text-brand-600 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">Open URL ↗</a>}
      </div>
      <pre className="max-h-96 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-emerald-200">{JSON.stringify(data, null, 2).slice(0, 20000)}</pre>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children || (Array.isArray(children) && children.every((c) => !c))) return null;
  return (
    <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function OpenFdaLabelResults({ results, meta, url }: { results: any[]; meta: any; url: string }) {
  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between text-xs">
        <span>✓ {meta?.results?.total ?? results.length} label(s) found</span>
        {url && <a className="text-brand-600 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">View raw JSON ↗</a>}
      </div>
      {results.slice(0, 3).map((r, i) => {
        const brand = (r.openfda?.brand_name?.[0]) || (r.openfda?.generic_name?.[0]) || 'Drug';
        const generic = r.openfda?.generic_name?.[0];
        return (
          <div key={i} className="card space-y-2">
            <h3 className="font-semibold">💊 {brand}{generic && generic !== brand ? <span className="text-xs opacity-70"> · {generic}</span> : null}</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <Section title="Indications &amp; usage"><p className="whitespace-pre-wrap text-xs">{(r.indications_and_usage?.[0] || '').slice(0, 900)}</p></Section>
              <Section title="Dosage &amp; administration"><p className="whitespace-pre-wrap text-xs">{(r.dosage_and_administration?.[0] || '').slice(0, 900)}</p></Section>
              <Section title="Warnings"><p className="whitespace-pre-wrap text-xs">{(r.warnings?.[0] || r.boxed_warning?.[0] || '').slice(0, 900)}</p></Section>
              <Section title="Contraindications"><p className="whitespace-pre-wrap text-xs">{(r.contraindications?.[0] || '').slice(0, 700)}</p></Section>
              <Section title="Adverse reactions"><p className="whitespace-pre-wrap text-xs">{(r.adverse_reactions?.[0] || '').slice(0, 900)}</p></Section>
              <Section title="Patient counselling / Drug Talk"><p className="whitespace-pre-wrap text-xs">{(r.patient_medication_information?.[0] || r.information_for_patients?.[0] || '').slice(0, 900)}</p></Section>
              <Section title="Pregnancy / lactation"><p className="whitespace-pre-wrap text-xs">{(r.pregnancy?.[0] || r.lactation?.[0] || '').slice(0, 600)}</p></Section>
              <Section title="How supplied"><p className="whitespace-pre-wrap text-xs">{(r.how_supplied?.[0] || '').slice(0, 500)}</p></Section>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdverseEventResults({ counts, url }: { counts: { term: string; count: number }[]; url: string }) {
  const max = Math.max(...counts.map((c) => c.count), 1);
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">⚠️ Top reported adverse reactions (FAERS)</span>
        {url && <a className="text-brand-600 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">Open raw ↗</a>}
      </div>
      <p className="text-[11px] opacity-70">FAERS reports are spontaneous, raw counts — not proof of causation. Use for hypothesis generation only.</p>
      <ul className="space-y-1">
        {counts.slice(0, 15).map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="w-48 truncate">{c.term}</span>
            <span className="flex-1 rounded-full bg-slate-100 dark:bg-slate-700"><span className="block h-2 rounded-full bg-brand-500" style={{ width: `${(c.count / max) * 100}%` }} /></span>
            <span className="w-16 text-right text-xs tabular-nums opacity-70">{c.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecallResults({ results, meta, url }: { results: any[]; meta: any; url: string }) {
  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between text-xs">
        <span>🚨 {meta?.results?.total ?? results.length} recall/enforcement report(s)</span>
        {url && <a className="text-brand-600 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">Open raw ↗</a>}
      </div>
      {results.slice(0, 10).map((r, i) => (
        <div key={i} className="card space-y-1 text-sm">
          <div className="font-semibold">{r.product_description?.split(';')[0] || 'Recalled product'}</div>
          <div className="text-xs opacity-70">
            Status: <b>{r.status || 'unknown'}</b> · Classification: <b>{r.classification || 'n/a'}</b>
            {r.recalling_firm ? ` · Firm: ${r.recalling_firm}` : ''}
            {r.report_date ? ` · ${r.report_date}` : ''}
          </div>
          <p className="text-xs whitespace-pre-wrap">{(r.reason_for_recall || '').slice(0, 500)}</p>
        </div>
      ))}
    </div>
  );
}

function RxNavInteractions({ data, url }: { data: any; url: string }) {
  // Flatten pairs
  type Pair = { severity: string; description: string };
  const pairs: Pair[] = [];
  for (const g of data.interactionTypeGroup ?? []) {
    for (const t of g.interactionType ?? []) {
      for (const p of t.interactionPair ?? []) {
        pairs.push({
          severity: t.interactionType || p.severity || 'N/A',
          description: p.description || '',
        });
      }
    }
  }
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">🔗 {pairs.length} potential interaction(s)</span>
        {url && <a className="text-brand-600 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">Open raw ↗</a>}
      </div>
      {pairs.length === 0 && <p className="text-sm opacity-70">No interactions returned. That does NOT mean the combination is safe — always check a reference and ask your supervisor.</p>}
      {pairs.map((p, i) => (
        <div key={i} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="mb-1 font-semibold text-amber-800 dark:text-amber-300">⚠ {p.severity}</div>
          <p className="whitespace-pre-wrap">{p.description}</p>
        </div>
      ))}
      <p className="text-[11px] opacity-60">Educational use only. Verify with a current reference (BNF, AHFS, your formulary).</p>
    </div>
  );
}

function UmlsResults({ results, url }: { results: any[]; url: string }) {
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">📖 {results.length} concept(s)</span>
        {url && <a className="text-brand-600 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">Open raw ↗</a>}
      </div>
      {results.slice(0, 20).map((r: any, i: number) => (
        <div key={i} className="rounded border border-slate-200 p-2 text-sm dark:border-slate-700">
          <div className="font-medium">{r.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] opacity-70">
            {r.ui && <span>CUI: <code>{r.ui}</code></span>}
            {r.rootSource && <span>Source: {r.rootSource}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
