import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { useNavigate } from 'react-router-dom';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { useData } from '../../stores/data';
import { useHealthApiStore, HealthApiEntry, HealthApiKind, HealthApiSource } from '../../stores/healthApiStore';
import { HEALTH_APIS, HEALTH_API_CATEGORIES, type HealthApiCategory, type HealthApiMeta } from '../../services/defaults';
import { openFda, rxNav, umls, dailyMed, pubmed, drugBank, goodrx, infermedica, evidenceMd, webmd, interactionCheckers, redox, particle, metriport, googleHealthcare, terra, spikeApi, fdb } from '../../services/healthApiClients';

type ApiId = string;

const CAT_COLORS: Record<HealthApiCategory, { bar: string; tab: string; ring: string }> = {
  gov:        { bar: 'from-sky-600 to-indigo-600',    tab: 'from-sky-600 to-indigo-600',    ring: 'ring-sky-500/40' },
  commercial: { bar: 'from-emerald-600 to-teal-600',  tab: 'from-emerald-600 to-teal-600',  ring: 'ring-emerald-500/40' },
  ehr:        { bar: 'from-violet-600 to-fuchsia-600',tab: 'from-violet-600 to-fuchsia-600',ring: 'ring-violet-500/40' },
  wearables:  { bar: 'from-orange-500 to-rose-600',   tab: 'from-orange-500 to-rose-600',   ring: 'ring-orange-500/40' },
};

export default function HealthApisPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const initStore = useHealthApiStore((s) => s._init);
  const entries = useHealthApiStore((s) => s.entries);
  const addEntry = useHealthApiStore((s) => s.addEntry);
  const updateEntry = useHealthApiStore((s) => s.updateEntry);
  const toggleFavorite = useHealthApiStore((s) => s.toggleFavorite);
  const removeEntry = useHealthApiStore((s) => s.removeEntry);
  const clearHistory = useHealthApiStore((s) => s.clearHistory);
  const filtered = useHealthApiStore((s) => s.filtered);

  useEffect(() => { initStore(); }, [initStore]);

  const keys = useMemo(() => settings?.healthApis ?? {}, [settings?.healthApis]);
  const hasKey = (id: string) => !!(keys[id]?.key?.trim() && keys[id]?.enabled);
  const isEnabled = (id: string) => keys[id]?.enabled !== false && (!HEALTH_APIS.find((a) => a.id === id)?.requiresKey || !!keys[id]?.key?.trim());

  // Default to first API of first category that is functional/enabled
  const [category, setCategory] = useState<HealthApiCategory>('gov');
  const categoryApis = useMemo(() => HEALTH_APIS.filter((a) => a.category === category), [category]);
  const firstFunctional = categoryApis.find((a) => a.functional && isEnabled(a.id)) || categoryApis.find((a) => a.functional) || categoryApis[0];
  const [activeApi, setActiveApi] = useState<ApiId>(firstFunctional.id);
  useEffect(() => { setActiveApi(firstFunctional.id); }, [category]); // eslint-disable-line

  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<HealthApiEntry | null>(null);
  const [err, setErr] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [historyScope, setHistoryScope] = useState<'all' | 'favorites' | ApiId>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const history = useMemo(() => filtered({ scope: historyScope === 'favorites' ? 'favorites' : 'all', search: historySearch }).filter((e) => historyScope === 'all' || historyScope === 'favorites' || e.source === historyScope),
    [filtered, historyScope, historySearch, entries]);

  function resetResult() { setCurrent(null); setErr(''); setDirectUrl(''); setShowRaw(false); }
  function loadSaved(e: HealthApiEntry) {
    setCurrent(e); setCategory(e.category as HealthApiCategory); setActiveApi(e.source); setErr(e.error || ''); setDirectUrl(e.url || ''); setShowRaw(false); setHistoryOpen(false);
  }

  async function runQuery(source: ApiId, kind: HealthApiKind, query: Record<string, any>, title: string, promise: Promise<any>) {
    setBusy(true); setErr(''); setDirectUrl(''); setShowRaw(false);
    try {
      const r = await promise as any;
      if (!r.ok) { setErr(r.error || 'Request failed'); setDirectUrl(r.url || ''); addEntry({ source: source as HealthApiSource, kind, query, title, url: r.url, data: null, error: r.error || 'Request failed' } as any); return; }
      const cat = HEALTH_APIS.find((a) => a.id === source)?.category || 'gov';
      const entry = addEntry({ source: source as HealthApiSource, kind, query, title, url: r.url, data: r.data } as any);
      (entry as any).category = cat;
      setCurrent(entry); setDirectUrl(r.url || '');
    } catch (e: any) { setErr(e?.message || 'Something went wrong'); addEntry({ source: source as HealthApiSource, kind, query, title, data: null, error: e?.message || 'Something went wrong' } as any); }
    finally { setBusy(false); }
  }

  const api = HEALTH_APIS.find((a) => a.id === activeApi);
  const favCount = entries.filter((e) => e.favorite).length;
  const cColor = CAT_COLORS[category];

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Health APIs"
        subtitle={<>Fast clinical lookups — saved offline. Shortcut: <Kbd>g</Kbd> <Kbd>y</Kbd> or <Kbd>Ctrl/⌘+Shift+H</Kbd>.</>}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton section="health-apis" prompt="Using my configured Health APIs, help me study: suggest how to combine them for a drug fact, give example queries, and point out licensing limits." />
            <button className="btn-secondary" onClick={() => setHistoryOpen(true)}>History <span className="ml-1 rounded-full bg-slate-300 px-1.5 text-[10px] font-bold dark:bg-slate-600">{entries.length}</span></button>
            <button className="btn-secondary" onClick={() => navigate('/settings?section=healthApis')}>API keys</button>
            <button className="btn-secondary" onClick={() => navigate('/journey')}>Back to Journey</button>
          </div>
        }
      />

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {HEALTH_API_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${category === c.id ? `border-transparent bg-gradient-to-r ${CAT_COLORS[c.id].tab} text-white shadow ring-2 ${CAT_COLORS[c.id].ring}` : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* API sub-tabs inside category */}
      <div className="flex flex-wrap gap-1.5">
        {categoryApis.map((a) => {
          const ready = !a.requiresKey || hasKey(a.id);
          const active = activeApi === a.id;
          return (
            <button key={a.id} onClick={() => { setActiveApi(a.id); resetResult(); }}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${active ? 'border-brand-600 bg-brand-600 text-white shadow ring-2 ring-brand-500/40 dark:border-brand-600 dark:bg-brand-600 dark:text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
              {a.name}{!ready && a.requiresKey ? <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-black uppercase text-amber-900 dark:bg-amber-700 dark:text-amber-100">key</span> : null}
              {!a.functional ? <span className="ml-1 rounded bg-slate-200 px-1 text-[9px] font-black uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">setup</span> : null}
            </button>
          );
        })}
      </div>

      {busy && (
        <div className="card flex items-center gap-2 text-sm"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /><span className="font-bold">Fetching…</span><span className="opacity-70">Saved to history automatically.</span></div>
      )}

      {api && <ApiPanel api={api} keys={keys} busy={busy} runQuery={runQuery} />}

      {err && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          {err}
          {directUrl && <a className="mt-2 ml-2 inline-block rounded bg-red-700 px-3 py-1 text-xs font-bold text-white hover:bg-red-800" href={directUrl} target="_blank" rel="noreferrer">Open URL</a>}
        </div>
      )}

      {current && !busy && <ResultCard entryId={current.id} showRaw={showRaw} onToggleRaw={() => setShowRaw(!showRaw)} onRemove={() => { removeEntry(current.id); setCurrent(null); }} onLabelChange={(t) => updateEntry(current.id, { title: t })} onTagsChange={(t) => updateEntry(current.id, { tags: t })} onNoteChange={(n) => updateEntry(current.id, { note: n })} toggleFavorite={() => toggleFavorite(current.id)} />}

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Lookup history (${entries.length})`} wide>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 min-w-40" placeholder="Search title, tag or query…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
            <button className="btn-secondary" onClick={() => { if (confirm('Clear all history?')) clearHistory(); }}>Clear all</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setHistoryScope('all')} className={`rounded-full border px-3 py-1 text-xs font-bold ${historyScope === 'all' ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>All ({entries.length})</button>
            <button onClick={() => setHistoryScope('favorites')} className={`rounded-full border px-3 py-1 text-xs font-bold ${historyScope === 'favorites' ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>Favourites ({favCount})</button>
            {HEALTH_APIS.filter((a) => a.functional).map((a) => (
              <button key={a.id} onClick={() => setHistoryScope(a.id)} className={`rounded-full border px-3 py-1 text-xs font-bold ${historyScope === a.id ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{a.name}</button>
            ))}
          </div>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {history.length === 0 && <p className="rounded-lg bg-slate-100 p-4 text-center text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-100">No saved lookups yet.</p>}
            {history.map((e) => (
              <button key={e.id} onClick={() => loadSaved(e)} className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left text-sm transition hover:border-brand-400 ${current?.id === e.id ? 'border-brand-500 bg-brand-50 text-slate-900 dark:border-brand-500 dark:bg-brand-900/40 dark:text-slate-100' : 'border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{(e as any).source || ''}</span>{e.favorite && <span className="rounded bg-amber-200 px-1 text-[9px] font-black uppercase text-amber-900 dark:bg-amber-700 dark:text-amber-100">Saved</span>}</div>
                  <div className="truncate font-bold">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] opacity-80"><span>{new Date(e.createdAt).toLocaleString()}</span>{e.tags.map((t) => <span key={t} className="rounded bg-slate-200 px-1 font-semibold text-slate-800 dark:bg-slate-600 dark:text-slate-100">#{t}</span>)}{e.error && <span className="rounded bg-red-200 px-1 font-bold text-red-900 dark:bg-red-900/60 dark:text-red-100">error</span>}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">{children}</kbd>;
}

/* ---------- API panel dispatch ---------- */
function ApiPanel({ api, keys, busy, runQuery }: { api: HealthApiMeta; keys: Record<string, any>; busy: boolean; runQuery: Function }) {
  if (!api.functional) return <SetupPanel api={api} />;
  switch (api.id) {
    case 'openfda':  return <OpenFdaPanel busy={busy} runQuery={runQuery} keys={keys} />;
    case 'rxnav':    return <RxNavPanel busy={busy} runQuery={runQuery} keys={keys} />;
    case 'dailymed': return <DailyMedPanel busy={busy} runQuery={runQuery} />;
    case 'pubmed':   return <PubmedPanel busy={busy} runQuery={runQuery} keys={keys} />;
    case 'umls':     return <UmlsPanel busy={busy} runQuery={runQuery} umlsKey={keys.umls?.key ?? ''} />;
    case 'drugbank': return <DrugBankPanel busy={busy} runQuery={runQuery} keys={keys} />;
    case 'goodrx':   return <GoodRxPanel busy={busy} runQuery={runQuery} keys={keys} />;
    case 'webmd':    return <WebMdPanel />;
    case 'evidencemd': return <EvidenceMdPanel busy={busy} runQuery={runQuery} keys={keys} />;
    case 'infermedica': return <InfermedicaPanel busy={busy} runQuery={runQuery} keys={keys} />;
    default: return <SetupPanel api={api} />;
  }
}

function SetupPanel({ api }: { api: HealthApiMeta }) {
  return (
    <div className="card space-y-2">
      <div className="text-sm font-bold">{api.name}</div>
      <p className="text-sm opacity-80">{api.data}</p>
      <p className="text-xs opacity-70">{api.access}</p>
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href={api.docs} target="_blank" rel="noreferrer">View documentation</a>
        <a className="btn-secondary" href={api.url} target="_blank" rel="noreferrer">Visit {api.name}</a>
      </div>
      <p className="text-[11px] opacity-70">Add credentials in API keys to enable a functional lookup panel. For enterprise APIs (Redox, Particle, FDB, etc.) you will need a contract or developer account with the vendor first.</p>
    </div>
  );
}

/* ---------- OpenFDA ---------- */
function OpenFdaPanel({ busy, runQuery, keys }: any) {
  const [drug, setDrug] = useState('');
  const q = drug.trim(); const canGo = !!q && !busy;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-sky-700 dark:text-sky-300">openFDA — FDA drug labels, adverse events, recalls</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug (generic fastest) — e.g. amlodipine" value={drug} onChange={(e) => setDrug(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('openfda', 'openfda-label', { query: q }, `Label — ${q}`, openFda.searchLabels(q, () => keys, 3))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-label', { query: q }, `Label — ${q}`, openFda.searchLabels(q, () => keys, 3))}>Drug label</button>
        <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-ae', { drug: q }, `Adverse reactions — ${q}`, openFda.adverseEvents(q, () => keys, 10))}>Adverse reactions</button>
        <button className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-recall', { query: q }, `Recalls — ${q}`, openFda.recalls(q, () => keys, 5))}>Recalls</button>
      </div>
      <p className="text-[11px] opacity-70">Generic names are fastest and most accurate. Optional api.data.gov key raises rate limits.</p>
    </div>
  );
}

/* ---------- RxNav: RxNorm resolution + openFDA label DDI + RxClass / drug info ---------- */
function RxNavPanel({ busy, runQuery, keys }: any) {
  // Interaction-check state
  const [drugs, setDrugs] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  // Single-drug info state
  const [infoDrug, setInfoDrug] = useState('');

  const add = () => { const v = draft.trim(); if (v) { setDrugs([...drugs, v]); setDraft(''); } };
  const remove = (i: number) => setDrugs(drugs.filter((_, j) => j !== i));

  function check() {
    if (drugs.length < 2) return;
    runQuery('rxnav', 'rxnav-ddi', { drugs: [...drugs] }, `Interactions — ${drugs.join(' + ')}`, (async () => {
      // Resolve each drug: exact rxcui → approximate → drugs.json fallback.
      const resolved = await Promise.all(drugs.map(async (name: string) => {
        let cui: string | null = null;
        try { const r: any = await rxNav.findRxCuiExact(name); if (r.ok) cui = r.data?.idGroup?.rxnormId?.[0] || null; } catch {}
        if (!cui) { try { const r: any = await rxNav.findRxCui(name); if (r.ok) cui = r.data?.idGroup?.rxnormId?.[0] || null; } catch {} }
        if (!cui) {
          try {
            const d: any = await rxNav.getDrugsByName(name);
            if (d.ok) {
              const concepts = d.data?.drugGroup?.conceptProperties || [];
              const scd = concepts.find((c: any) => /SCD/i.test(c?.tty || ''));
              const c = scd?.rxcui || concepts[0]?.rxcui;
              if (c) cui = c;
            }
          } catch {}
        }
        return { name, cui };
      }));
      const unresolved = resolved.filter((x: any) => !x.cui).map((x: any) => x.name);

      const labels: any[] = await Promise.all(resolved.map(async (r: any) => {
        try {
          const l: any = await openFda.drugInteractionsText(r.name, () => keys);
          if (l.ok) return { name: r.name, cui: r.cui, brand: l.data.brand, generic: l.data.generic, text: l.data.interactionsText, setid: l.data.setid, url: l.url, ok: true };
        } catch {}
        return { name: r.name, cui: r.cui, ok: false };
      }));

      const pairs: { a: string; b: string; sentences: string[]; found: boolean }[] = [];
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i], b = labels[j];
          const sentences: string[] = [];
          for (const src of [a, b]) {
            if (!src.ok || !src.text) continue;
            const other = (src === a ? b.name : a.name).toLowerCase();
            const sents = src.text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
            for (const s of sents) {
              if (s.toLowerCase().includes(other)) {
                const clean = s.trim();
                if (clean && clean.length > 20 && clean.length < 600) sentences.push(clean);
              }
            }
          }
          pairs.push({ a: a.name, b: b.name, sentences: [...new Set(sentences)].slice(0, 5), found: sentences.length > 0 });
        }
      }

      const links = {
        rxlist: interactionCheckers.rxlist(drugs),
        drugscom: interactionCheckers.drugscom(drugs),
        webmd: interactionCheckers.webmd(drugs),
      };

      const okLabels = labels.filter((l: any) => l.ok);
      if (okLabels.length === 0 && unresolved.length) {
        return { ok: false as const, error: `Could not resolve to RxNorm/openFDA: ${unresolved.join(', ')}. Try generic names (e.g. "amlodipine" not "Norvasc"). Use a checker link below.`, url: links.rxlist };
      }

      return {
        ok: true as const,
        data: { _resolved: resolved, _labels: labels, _pairs: pairs, _links: links, _note: 'NLM discontinued the RxNav interaction API Jan 2024. Results pull FDA SPL drug_interactions sections; full-checker buttons below.' },
        url: links.rxlist,
      };
    })());
  }

  function info() {
    const name = infoDrug.trim();
    if (!name) return;
    runQuery('rxnav', 'rxnav-info', { drug: name }, `Drug info — ${name}`, (async () => {
      // 1) resolve to RxCUI
      let cui: string | null = null;
      try { const r: any = await rxNav.findRxCuiExact(name); if (r.ok) cui = r.data?.idGroup?.rxnormId?.[0] || null; } catch {}
      if (!cui) { try { const r: any = await rxNav.findRxCui(name); if (r.ok) cui = r.data?.idGroup?.rxnormId?.[0] || null; } catch {} }
      if (!cui) {
        try {
          const d: any = await rxNav.getDrugsByName(name);
          if (d.ok) {
            const concepts = d.data?.drugGroup?.conceptProperties || [];
            const scd = concepts.find((c: any) => /IN|MIN|PIN/i.test(c?.tty || '')) || concepts.find((c: any) => /SCD/i.test(c?.tty || ''));
            cui = scd?.rxcui || concepts[0]?.rxcui || null;
          }
        } catch {}
      }
      if (!cui) return { ok: false as const, error: `Could not resolve "${name}" to RxNorm. Try generic name.`, url: `https://rxnav.nlm.nih.gov/REST/rxcui?name=${encodeURIComponent(name)}` };

      // 2) pull properties, classes, brands in parallel
      const [props, rxclass, related, label] = await Promise.all([
        rxNav.getProperties(cui).catch(() => ({ ok: false })),
        rxNav.rxClass(cui).catch(() => ({ ok: false })),
        rxNav.getRelated(cui, 'BN+IN+PIN+SBD+BPCK+SCD').catch(() => ({ ok: false })),
        openFda.drugInteractionsText(name, () => keys).catch(() => ({ ok: false })),
      ]);

      // Brand names
      const brands = new Set<string>();
      if ((related as any).ok) {
        const groups: any[] = (related as any).data?.relatedGroup?.conceptGroup || [];
        for (const g of groups) {
          if (/BN|SBD|BPCK/i.test(g.tty || '')) {
            for (const p of (g.conceptProperties || [])) brands.add(p.name);
          }
        }
      }
      // Classes (de-dup by classId, preferring IN-level tty matches first)
      const seen = new Set<string>();
      const atc: { id: string; name: string }[] = [];
      const va: { id: string; name: string }[] = [];
      const mesh: { id: string; name: string }[] = [];
      const mayTreat: { id: string; name: string }[] = [];
      const ciWith: { id: string; name: string }[] = [];
      const snomed: { id: string; name: string }[] = [];
      if ((rxclass as any).ok) {
        const infos: any[] = (rxclass as any).data?.rxclassDrugInfoList?.rxclassDrugInfo || [];
        for (const it of infos) {
          // Only keep entries where the minConcept is the ingredient itself (rxcui matches)
          if (String(it.minConcept?.rxcui) !== String(cui) && it.minConcept?.tty !== 'IN') continue;
          const cls = it.rxclassMinConceptItem;
          if (!cls || seen.has(cls.classId)) continue;
          seen.add(cls.classId);
          const entry = { id: cls.classId, name: cls.className };
          const ct = String(cls.classType || '');
          if (ct.startsWith('ATC')) atc.push(entry);
          else if (ct === 'VA') va.push(entry);
          else if (ct === 'MESH') mesh.push(entry);
          else if (it.rela === 'may_treat') mayTreat.push(entry);
          else if (it.rela === 'CI_with' || it.rela === 'contraindicated_with') ciWith.push(entry);
          else if (ct === 'STRUCT' || ct === 'DISPOS' || ct === 'SNOMED') snomed.push(entry);
        }
      }

      return {
        ok: true as const,
        url: `https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${cui}`,
        data: {
          name, rxcui: cui,
          props: (props as any).ok ? (props as any).data?.properties : null,
          brands: [...brands].slice(0, 30),
          atc: atc.slice(0, 8), va: va.slice(0, 8), mesh: mesh.slice(0, 6),
          mayTreat: mayTreat.slice(0, 12), ciWith: ciWith.slice(0, 10), snomed: snomed.slice(0, 8),
          interactionsSummary: (label as any).ok ? (label as any).data?.interactionsText?.slice(0, 1200) : '',
          generic: (label as any).ok ? (label as any).data?.generic : '',
        },
      };
    })());
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">RxNav (NIH/NLM) — RxNorm · drug info · interaction check</div>
        <div className="text-[11px] opacity-70">RxNorm + RxClass still live; interaction API was retired Jan 2024 (openFDA + checker link-outs used instead).</div>
      </div>

      {/* Section 1: Drug info */}
      <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Drug info (RxNorm + RxClass + openFDA)</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder="Single drug (generic) — e.g. warfarin" value={infoDrug} onChange={(e) => setInfoDrug(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && info()} />
          <button className="btn-primary" disabled={busy || !infoDrug.trim()} onClick={info}>Lookup</button>
        </div>
      </div>

      {/* Section 2: Interaction check */}
      <div className="rounded-lg border-2 border-sky-200 bg-sky-50/50 p-3 dark:border-sky-800 dark:bg-sky-950/30">
        <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">Drug–drug interaction check</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder="Add drug (generic) — press Enter" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && draft.trim() && add()} />
          <button className="btn-secondary" onClick={add} disabled={!draft.trim()}>Add</button>
          <button className="btn-primary" disabled={busy || drugs.length < 2} onClick={check}>Check interactions</button>
        </div>
        {drugs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {drugs.map((d: string, i: number) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-sky-400 dark:bg-sky-500 dark:text-white dark:ring-sky-300">
                {d}<button onClick={() => remove(i)} className="rounded-full bg-white/20 px-1 text-white hover:bg-red-500 hover:text-white" aria-label={`Remove ${d}`}>×</button>
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[12px] font-medium text-slate-700 dark:text-slate-300">Add 2+ generic drugs. Name resolution via RxNorm (exact → approximate → SCD); interaction data via FDA SPL labels + one-click checkers.</p>
      </div>
    </div>
  );
}

/* ---------- DailyMed ---------- */
function DailyMedPanel({ busy, runQuery }: any) {
  const [q, setQ] = useState('');
  const query = q.trim(); const canGo = !!query && !busy;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300">DailyMed — official FDA Structured Product Labeling (SPL)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug name — e.g. lisinopril" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('dailymed', 'openfda-label', { query }, `DailyMed SPL — ${query}`, dailyMed.search(query, 5))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('dailymed', 'openfda-label', { query }, `DailyMed SPL — ${query}`, dailyMed.search(query, 5))}>Search SPLs</button>
      </div>
      <p className="text-[11px] opacity-70">Returns official FDA SPL listings with setids — click through to the full label on DailyMed.</p>
    </div>
  );
}

/* ---------- PubMed ---------- */
function PubmedPanel({ busy, runQuery, keys }: any) {
  const [q, setQ] = useState('');
  const query = q.trim(); const canGo = !!query && !busy;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300">PubMed — biomedical literature (NCBI E-utilities)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Search terms (e.g. amlodipine edema mechanism)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('pubmed', 'umls', { term: query }, `PubMed — ${query}`, pubmed.search(query, () => keys, 10))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('pubmed', 'umls', { term: query }, `PubMed — ${query}`, pubmed.search(query, () => keys, 10))}>Search</button>
      </div>
      <p className="text-[11px] opacity-70">Add a free NCBI API key in Settings for 10 req/s (3 without).</p>
    </div>
  );
}

/* ---------- UMLS ---------- */
function UmlsPanel({ busy, runQuery, umlsKey }: any) {
  const [term, setTerm] = useState(''); const [sab, setSab] = useState('');
  if (!umlsKey?.trim()) return (<div className="card"><div className="text-sm font-bold text-violet-700 dark:text-violet-300">UMLS requires a free UTS API key</div><p className="mt-2 text-sm">Add it in <b>Settings → Health APIs</b>.</p><div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => { (window as any).location.hash = '#/settings?section=healthApis'; }}>Go to Settings</button><a className="btn-primary" href="https://uts.nlm.nih.gov/uts/" target="_blank" rel="noreferrer">Get free account</a></div></div>);
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-violet-700 dark:text-violet-300">UMLS — terminology (SNOMED CT, ICD-10, RxNorm, MeSH)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Term" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && term.trim() && runQuery('umls', 'umls', { term, sab }, `UMLS — ${term}${sab ? ' (' + sab + ')' : ''}`, umls.searchConcept(term.trim(), sab, umlsKey, 15))} />
        <select className="input" value={sab} onChange={(e) => setSab(e.target.value)}>
          <option value="">All vocabularies</option><option value="SNOMEDCT_US">SNOMED CT (US)</option><option value="ICD10CM">ICD-10-CM</option><option value="RXNORM">RxNorm</option><option value="MSH">MeSH</option><option value="MDR">MedDRA</option>
        </select>
        <button className="btn-primary" disabled={busy || !term.trim()} onClick={() => runQuery('umls', 'umls', { term, sab }, `UMLS — ${term}${sab ? ' (' + sab + ')' : ''}`, umls.searchConcept(term.trim(), sab, umlsKey, 15))}>Search</button>
      </div>
    </div>
  );
}

/* ---------- DrugBank ---------- */
function DrugBankPanel({ busy, runQuery, keys }: any) {
  const [q, setQ] = useState('');
  const query = q.trim(); const canGo = !!query && !busy && keys.drugbank?.key?.trim();
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">DrugBank — structured drug database (commercial)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug name — e.g. warfarin" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('drugbank', 'openfda-label', { query }, `DrugBank — ${query}`, drugBank.search(query, () => keys, 10))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('drugbank', 'openfda-label', { query }, `DrugBank — ${query}`, drugBank.search(query, () => keys, 10))}>Search</button>
        {!keys.drugbank?.key?.trim() && <a className="btn-secondary" href="#/settings?section=healthApis">Add key</a>}
      </div>
      <p className="text-[11px] opacity-70">Commercial API (paid). Add a Bearer token and (optionally) a custom base URL in Settings.</p>
    </div>
  );
}

/* ---------- GoodRx ---------- */
function GoodRxPanel({ busy, runQuery, keys }: any) {
  const [drug, setDrug] = useState(''); const [zip, setZip] = useState('');
  const q = drug.trim(); const canGo = !!q && !busy && keys.goodrx?.key?.trim();
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">GoodRx — real-time US prescription pricing</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-32 flex-1" placeholder="Drug" value={drug} onChange={(e) => setDrug(e.target.value)} />
        <input className="input min-w-28" placeholder="ZIP (optional)" value={zip} onChange={(e) => setZip(e.target.value)} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('goodrx', 'openfda-recall', { drug: q, zip }, `GoodRx prices — ${q}`, goodrx.prices(q, () => keys, zip))}>Prices</button>
        {!!q && <a className="btn-secondary" target="_blank" rel="noreferrer" href={goodrx.couponUrl(q)}>Coupon page</a>}
      </div>
      <p className="text-[11px] opacity-70">Partner API — requires key. If the API is blocked, the "Coupon page" link opens the public GoodRx page directly.</p>
    </div>
  );
}

/* ---------- EvidenceMD ---------- */
function EvidenceMdPanel({ busy, runQuery, keys }: any) {
  const [q, setQ] = useState('');
  const query = q.trim(); const canGo = !!query && !busy && keys.evidencemd?.key?.trim();
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">EvidenceMD — peer-reviewed medical Q&A with citations</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Clinical question — e.g. first-line for HFrEF" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('evidencemd', 'umls', { query }, `EvidenceMD — ${query}`, evidenceMd.ask(query, () => keys))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('evidencemd', 'umls', { query }, `EvidenceMD — ${query}`, evidenceMd.ask(query, () => keys))}>Ask</button>
      </div>
      <p className="text-[11px] opacity-70">Returns medical reasoning with PubMed citations. Add your API key in Settings.</p>
    </div>
  );
}

/* ---------- Infermedica (symptom parse demo) ---------- */
function InfermedicaPanel({ busy, runQuery, keys }: any) {
  const [text, setText] = useState('');
  const query = text.trim(); const configured = !!keys.infermedica?.key?.trim(); const canGo = !!query && !busy && configured;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Infermedica — symptom parsing & triage</div>
      <textarea className="input min-h-[80px]" placeholder="Describe symptoms — e.g. 45F with 3 days of sharp chest pain worse on inspiration" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('infermedica', 'umls', { text: query }, `Infermedica — ${query.slice(0, 40)}`, infermedica.parse(query, () => keys))}>Parse</button>
        {!configured && <a className="btn-secondary" href="#/settings?section=healthApis">Add credentials (app-id:app-key)</a>}
      </div>
      <p className="text-[11px] opacity-70">Key format: <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">app-id:app-key</code>. Parses free text into mentions, risk factors, and observations.</p>
    </div>
  );
}

/* ---------- WebMD/RxList link-outs ---------- */
function WebMdPanel() {
  const [query, setQuery] = useState('');
  const [drugs, setDrugs] = useState<string[]>([]);
  const [d, setD] = useState('');
  const addDrug = () => { const v = d.trim(); if (v) { setDrugs([...drugs, v]); setD(''); } };
  const q = query.trim();
  return (
    <div className="card space-y-4">
      <div className="text-sm font-bold text-orange-700 dark:text-orange-300">RxList / WebMD — patient-friendly monographs (link-outs)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug or condition" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q && window.open(webmd.drugSearchUrl(q), '_blank')} />
        <a className="btn-primary" target="_blank" rel="noreferrer" href={q ? webmd.drugSearchUrl(q) : '#'}>Monograph</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={q ? webmd.conditionSearchUrl(q) : '#'}>Condition</a>
      </div>
      <div>
        <div className="label mb-1">Interaction checker</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder="Drug" value={d} onChange={(e) => setD(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && d.trim() && addDrug()} />
          <button className="btn-secondary" disabled={!d.trim()} onClick={addDrug}>Add</button>
        </div>
        {drugs.length > 0 && (<><div className="mt-2 flex flex-wrap gap-1.5">{drugs.map((x, i) => (<span key={i} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-900 dark:bg-orange-900/60 dark:text-orange-100">{x}<button onClick={() => setDrugs(drugs.filter((_, j) => j !== i))} className="text-orange-800 hover:text-red-600 dark:text-orange-200">×</button></span>))}</div><a className="btn-primary mt-2 inline-block" target="_blank" rel="noreferrer" href={webmd.interactionsCheckUrl(drugs)}>Open RxList interaction checker</a></>)}
      </div>
    </div>
  );
}

/* ---------- Result card (shared; reads live from store) ---------- */
import { ResultCard } from './HealthApisResults';

/* HealthApiSource + HealthApiKind compatibility with store */
declare module '../../stores/healthApiStore' {
  interface HealthApiEntry { category?: string }
}
