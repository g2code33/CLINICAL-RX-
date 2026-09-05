import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { useNavigate } from 'react-router-dom';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { useData } from '../../stores/data';
import { useHealthApiStore, HealthApiEntry, HealthApiKind, HealthApiSource } from '../../stores/healthApiStore';
import { openFda, rxNav, umls, webmd } from '../../services/healthApiClients';

type TabId = HealthApiSource;

const TABS: { id: TabId; label: string; color: string; ring: string }[] = [
  { id: 'openfda', label: 'openFDA',       color: 'from-sky-600 to-cyan-600',       ring: 'ring-sky-500/40' },
  { id: 'rxnav',   label: 'RxNav',         color: 'from-emerald-600 to-teal-600',   ring: 'ring-emerald-500/40' },
  { id: 'umls',    label: 'UMLS',          color: 'from-violet-600 to-fuchsia-600', ring: 'ring-violet-500/40' },
  { id: 'webmd',   label: 'RxList / WebMD', color: 'from-orange-600 to-rose-600',   ring: 'ring-orange-500/40' },
];

const SOURCE_META: Record<TabId, { label: string; accent: string }> = {
  openfda: { label: 'openFDA',        accent: 'sky' },
  rxnav:   { label: 'RxNav',          accent: 'emerald' },
  umls:    { label: 'UMLS',           accent: 'violet' },
  webmd:   { label: 'RxList / WebMD', accent: 'orange' },
};

// Severity colours — solid chip + strong card pairing; text colour is forced
// with !important so the global contrast safety net cannot fade it out.
const SEV_CHIP: Record<string, string> = {
  high:     'bg-red-700 text-white',
  severe:   'bg-red-700 text-white',
  major:    'bg-orange-700 text-white',
  moderate: 'bg-amber-600 text-white',
  minor:    'bg-sky-700 text-white',
  'n/a':    'bg-slate-600 text-white',
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

  const [tab, setTab] = useState<TabId>('openfda');
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<HealthApiEntry | null>(null);
  const [err, setErr] = useState<string>('');
  const [directUrl, setDirectUrl] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);
  const [historyScope, setHistoryScope] = useState<'all' | 'favorites' | TabId>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const keys = useMemo(() => settings?.healthApis ?? {}, [settings?.healthApis]);
  const hasKey = (id: string) => !!(keys[id]?.key?.trim() && keys[id]?.enabled);

  const history = useMemo(
    () => filtered({ scope: historyScope, search: historySearch }),
    [filtered, historyScope, historySearch, entries]
  );

  function resetResult() { setCurrent(null); setErr(''); setDirectUrl(''); setShowRaw(false); }

  function loadSaved(e: HealthApiEntry) {
    setCurrent(e); setTab(e.source); setErr(e.error || ''); setDirectUrl(e.url || ''); setShowRaw(false); setHistoryOpen(false);
  }

  async function runQuery(source: HealthApiSource, kind: HealthApiKind, query: Record<string, any>, title: string, promise: Promise<any>) {
    setBusy(true); setErr(''); setDirectUrl(''); setShowRaw(false);
    try {
      const r = await promise as any;
      if (!r.ok) {
        setErr(r.error || 'Request failed'); setDirectUrl(r.url || '');
        addEntry({ source, kind, query, title, url: r.url, data: null, error: r.error || 'Request failed' });
        return;
      }
      const entry = addEntry({ source, kind, query, title, url: r.url, data: r.data });
      setCurrent(entry); setDirectUrl(r.url || '');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong');
      addEntry({ source, kind, query, title, data: null, error: e?.message || 'Something went wrong' });
    } finally { setBusy(false); }
  }

  const favCount = entries.filter((e) => e.favorite).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Health APIs"
        subtitle={<>Fast clinical lookups — saved automatically for offline study. Star favourites, tag and label for exams. Shortcut: <Kbd>g</Kbd> <Kbd>y</Kbd> or <Kbd>Ctrl/⌘+Shift+H</Kbd>.</>}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="health-apis"
              prompt="Using my configured Health APIs, help me study: suggest how to combine openFDA, RxNav and UMLS to verify a drug fact, give example queries, and point out licensing limits."
            />
            <button className="btn-secondary" onClick={() => setHistoryOpen(true)}>
              History <span className="ml-1 rounded-full bg-slate-300 px-1.5 text-[10px] font-bold dark:bg-slate-600">{entries.length}</span>
            </button>
            <button className="btn-secondary" onClick={() => navigate('/settings?section=healthApis')}>API keys</button>
            <button className="btn-secondary" onClick={() => navigate('/journey')}>Back to Journey</button>
          </div>
        }
      />

      <div className="mb-2 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const needKey = t.id === 'umls';
          const ready = !needKey || hasKey(t.id);
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); resetResult(); }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                active ? `border-transparent bg-gradient-to-r ${t.color} text-white shadow ring-2 ${t.ring}`
                       : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}>
              <span>{t.label}</span>
              {!ready && <span className="ml-0.5 rounded-full bg-white/25 px-1 text-[9px]">key</span>}
            </button>
          );
        })}
      </div>

      {busy && (
        <div className="card flex items-center gap-2 text-sm">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span className="font-bold">Fetching…</span>
          <span className="opacity-70">Saved to your history automatically.</span>
        </div>
      )}

      {tab === 'openfda' && <OpenFdaPanel busy={busy} runQuery={runQuery} keys={keys} />}
      {tab === 'rxnav' && <RxNavPanel busy={busy} runQuery={runQuery} />}
      {tab === 'umls' && <UmlsPanel busy={busy} runQuery={runQuery} umlsKey={keys.umls?.key ?? ''} />}
      {tab === 'webmd' && <WebMdPanel />}

      {err && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:border-red-700 dark:bg-red-950/60 dark:text-red-50">
          {err}
          {directUrl && (
            <a className="mt-2 inline-block rounded bg-red-700 px-3 py-1 text-xs font-bold text-white hover:bg-red-800" href={directUrl} target="_blank" rel="noreferrer">Open URL in new tab</a>
          )}
        </div>
      )}

      {current && !busy && (
        <ResultCard
          entryId={current.id} showRaw={showRaw} onToggleRaw={() => setShowRaw(!showRaw)}
          onRemove={() => { removeEntry(current.id); setCurrent(null); }}
          onLabelChange={(title) => updateEntry(current.id, { title })}
          onTagsChange={(tags) => updateEntry(current.id, { tags })}
          onNoteChange={(note) => updateEntry(current.id, { note })}
          toggleFavorite={() => toggleFavorite(current.id)}
        />
      )}

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Health API history (${entries.length})`} wide>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 min-w-40" placeholder="Search title, tag or query…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
            <button className="btn-secondary" onClick={() => { if (confirm('Clear all history? Favourites will also be removed.')) clearHistory(); }}>Clear all</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([['all', `All (${entries.length})`], ['favorites', `Favourites (${favCount})`], ...TABS.map((t) => [t.id, t.label] as const)] as const).map(([k, label]) => (
              <button key={k} onClick={() => setHistoryScope(k as any)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${historyScope === k ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {history.length === 0 && <p className="rounded-lg bg-slate-100 p-4 text-center text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-100">No saved lookups yet. Run a search and it will appear here — works fully offline.</p>}
            {history.map((e) => (
              <button key={e.id} onClick={() => loadSaved(e)}
                className={`flex w-full items-start justify-between gap-2 rounded-lg border p-2 text-left text-sm transition hover:border-brand-400 ${current?.id === e.id ? 'border-brand-500 bg-brand-50 text-slate-900 dark:border-brand-500 dark:bg-brand-900/40 dark:text-slate-100' : 'border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{SOURCE_META[e.source].label}</span>
                    {e.favorite && <span className="rounded bg-amber-200 px-1 text-[9px] font-black uppercase text-amber-900 dark:bg-amber-700 dark:text-amber-100">Saved</span>}
                  </div>
                  <div className="truncate font-bold">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] opacity-80">
                    <span>{new Date(e.createdAt).toLocaleString()}</span>
                    {e.tags.map((t) => <span key={t} className="rounded bg-slate-200 px-1 font-semibold text-slate-800 dark:bg-slate-600 dark:text-slate-100">#{t}</span>)}
                    {e.error && <span className="rounded bg-red-200 px-1 font-bold text-red-900 dark:bg-red-900/60 dark:text-red-100">error</span>}
                  </div>
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

/* ---------- Input panels ---------- */
function OpenFdaPanel({ busy, runQuery, keys }: { busy: boolean; runQuery: Function; keys: Record<string, any> }) {
  const [drug, setDrug] = useState('');
  const q = drug.trim();
  const canGo = !!q && !busy;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-sky-700 dark:text-sky-300">openFDA — U.S. Food and Drug Administration</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug (generic name is fastest) — e.g. amlodipine, metformin" value={drug} onChange={(e) => setDrug(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('openfda', 'openfda-label', { query: q }, `Label — ${q}`, openFda.searchLabels(q, () => keys, 3))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-label', { query: q }, `Label — ${q}`, openFda.searchLabels(q, () => keys, 3))}>Drug label</button>
        <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-ae', { drug: q }, `Adverse reactions — ${q}`, openFda.adverseEvents(q, () => keys, 10))}>Adverse reactions</button>
        <button className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-recall', { query: q }, `Recalls — ${q}`, openFda.recalls(q, () => keys, 5))}>Recalls</button>
      </div>
      <p className="text-[11px] opacity-70">Use generic names for fastest results (e.g. <b>amlodipine</b>, not “Norvasc”). Results auto-save for offline review.</p>
    </div>
  );
}

function RxNavPanel({ busy, runQuery }: { busy: boolean; runQuery: Function }) {
  const [drugs, setDrugs] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v) { setDrugs([...drugs, v]); setDraft(''); } };
  const remove = (i: number) => setDrugs(drugs.filter((_, j) => j !== i));
  function checkInteractions() {
    if (drugs.length < 2) return;
    runQuery('rxnav', 'rxnav-ddi', { drugs: [...drugs] }, `Interactions — ${drugs.join(' + ')}`, (async () => {
      const resolved = await Promise.all(drugs.map(async (name) => {
        const r = await rxNav.findRxCui(name) as any;
        return { name, cui: r?.idGroup?.rxnormId?.[0] || null };
      }));
      const cuis = resolved.filter((x) => x.cui).map((x) => x.cui!);
      const unresolved = resolved.filter((x) => !x.cui).map((x) => x.name);
      if (cuis.length < 2) return { ok: false, error: `Could not resolve to RxNorm: ${unresolved.join(', ')}. Try generic names.` };
      const ir = await rxNav.interactions(cuis) as any;
      if (!ir.ok) return ir;
      return { ok: true, data: { ...ir.data, _resolved: resolved }, url: rxNav.interactionUrl(cuis) };
    })());
  }
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">RxNav — NIH/NLM interactions (parallel lookups)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Add a drug (generic) — press Enter" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && draft.trim() && add()} />
        <button className="btn-secondary" onClick={add} disabled={!draft.trim()}>Add</button>
        <button className="btn-primary" disabled={busy || drugs.length < 2} onClick={checkInteractions}>Check interactions</button>
      </div>
      {drugs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {drugs.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100">
              {d}
              <button onClick={() => remove(i)} className="text-emerald-800 hover:text-red-600 dark:text-emerald-200">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function UmlsPanel({ busy, runQuery, umlsKey }: { busy: boolean; runQuery: Function; umlsKey: string }) {
  const [term, setTerm] = useState('');
  const [sab, setSab] = useState('');
  if (!umlsKey?.trim()) {
    return (
      <div className="card">
        <div className="text-sm font-bold text-violet-700 dark:text-violet-300">UMLS requires a free UTS API key</div>
        <p className="mt-2 text-sm">Add it in <b>Settings → Health APIs</b> to search SNOMED CT, ICD-10, RxNorm and MeSH.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => { (window as any).location.hash = '#/settings?section=healthApis'; }}>Go to Settings</button>
          <a className="btn-primary" href="https://uts.nlm.nih.gov/uts/" target="_blank" rel="noreferrer">Get a free UMLS account</a>
        </div>
      </div>
    );
  }
  return (
    <div className="card space-y-3">
      <div className="text-sm font-bold text-violet-700 dark:text-violet-300">UMLS — Unified Medical Language System (NLM)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Term (e.g. hypertension, STEMI, amlodipine)" value={term} onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && term.trim() && runQuery('umls', 'umls', { term, sab }, `UMLS — ${term}${sab ? ' (' + sab + ')' : ''}`, umls.searchConcept(term.trim(), sab, umlsKey, 15))} />
        <select className="input" value={sab} onChange={(e) => setSab(e.target.value)}>
          <option value="">All vocabularies</option>
          <option value="SNOMEDCT_US">SNOMED CT (US)</option>
          <option value="ICD10CM">ICD-10-CM</option>
          <option value="RXNORM">RxNorm</option>
          <option value="MSH">MeSH</option>
          <option value="MDR">MedDRA</option>
        </select>
        <button className="btn-primary" disabled={busy || !term.trim()} onClick={() => runQuery('umls', 'umls', { term, sab }, `UMLS — ${term}${sab ? ' (' + sab + ')' : ''}`, umls.searchConcept(term.trim(), sab, umlsKey, 15))}>Search</button>
      </div>
    </div>
  );
}

function WebMdPanel() {
  const [query, setQuery] = useState('');
  const [drugs, setDrugs] = useState<string[]>([]);
  const [d, setD] = useState('');
  const addDrug = () => { const v = d.trim(); if (v) { setDrugs([...drugs, v]); setD(''); } };
  const q = query.trim();
  return (
    <div className="card space-y-4">
      <div className="text-sm font-bold text-orange-700 dark:text-orange-300">RxList / WebMD — patient-friendly monographs</div>
      <p className="text-xs opacity-80">WebMD has no public JSON API, so Clinical Rx builds direct deep links that open in a new tab — ideal for patient counselling practice.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug or condition" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q && window.open(webmd.drugSearchUrl(q), '_blank')} />
        <a className="btn-primary" target="_blank" rel="noreferrer" href={q ? webmd.drugSearchUrl(q) : '#'}>Drug monograph</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={q ? webmd.conditionSearchUrl(q) : '#'}>Condition search</a>
      </div>
      <div>
        <div className="label mb-1">Interaction checker</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder="Drug name" value={d} onChange={(e) => setD(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && d.trim() && addDrug()} />
          <button className="btn-secondary" disabled={!d.trim()} onClick={addDrug}>Add</button>
        </div>
        {drugs.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {drugs.map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-900 dark:bg-orange-900/60 dark:text-orange-100">
                  {x} <button onClick={() => setDrugs(drugs.filter((_, j) => j !== i))} className="text-orange-800 hover:text-red-600 dark:text-orange-200">×</button>
                </span>
              ))}
            </div>
            <a className="btn-primary mt-2 inline-block" target="_blank" rel="noreferrer" href={webmd.interactionsCheckUrl(drugs)}>Open RxList interaction checker</a>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Result card ---------- */
function ResultCard(props: {
  entryId: string; showRaw: boolean; onToggleRaw: () => void;
  onRemove: () => void;
  onLabelChange: (t: string) => void; onTagsChange: (t: string[]) => void; onNoteChange: (n: string) => void;
  toggleFavorite: () => void;
}) {
  const { entryId, showRaw, onToggleRaw, onRemove, onLabelChange, onTagsChange, onNoteChange, toggleFavorite } = props;

  // Read the live entry from the store so tags/fav/note updates show instantly.
  const entry = useHealthApiStore((s) => s.entries.find((e) => e.id === entryId));
  const [tagDraft, setTagDraft] = useState('');
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => { setNoteDraft(entry?.note || ''); }, [entry?.id, entry?.note]);

  if (!entry) return null;

  const addTag = () => {
    const v = tagDraft.trim().replace(/^#/, '');
    const e = entry!;
    if (v && !e.tags.includes(v)) onTagsChange([...e.tags, v]);
    setTagDraft(''); setTagEditOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-2 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button onClick={toggleFavorite} title={entry.favorite ? 'Remove favourite' : 'Add to favourites'}
            className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${entry.favorite ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'}`}>
            {entry.favorite ? 'Favourited' : 'Favourite'}
          </button>
          {labelEditing ? (
            <input autoFocus className="input flex-1 py-1 text-sm" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => { if (labelDraft.trim()) onLabelChange(labelDraft.trim()); setLabelEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { if (labelDraft.trim()) onLabelChange(labelDraft.trim()); setLabelEditing(false); } }} />
          ) : (
            <button onClick={() => { setLabelDraft(entry.title); setLabelEditing(true); }} className="min-w-0 flex-1 truncate text-left text-sm font-bold hover:underline" title="Click to rename">
              <span className="mr-1.5 rounded bg-slate-300 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-900 dark:bg-slate-600 dark:text-slate-100">{SOURCE_META[entry.source].label}</span>
              {entry.title}
            </button>
          )}
          <span className="shrink-0 text-[10px] opacity-70">{new Date(entry.createdAt).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {entry.url && <a className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600" href={entry.url} target="_blank" rel="noreferrer">Raw JSON</a>}
          <button onClick={onToggleRaw} className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">{showRaw ? 'Pretty view' : 'View raw'}</button>
          <button onClick={onRemove} className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60">Delete</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Tags</span>
        {entry.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-900 dark:bg-brand-900 dark:text-brand-100">
            #{t}
            <button onClick={() => onTagsChange(entry.tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">×</button>
          </span>
        ))}
        {tagEditOpen ? (
          <input autoFocus className="w-28 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" placeholder="tag…" value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={addTag}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } if (e.key === 'Escape') { setTagEditOpen(false); setTagDraft(''); } }} />
        ) : (
          <button onClick={() => { setTagDraft(''); setTagEditOpen(true); }} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-bold text-slate-700 opacity-80 hover:opacity-100 dark:border-slate-600 dark:text-slate-200">+ Add tag</button>
        )}
      </div>

      {entry.error ? (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          {entry.error}
          {entry.url && <div className="mt-2"><a className="rounded bg-red-700 px-3 py-1 text-xs font-bold text-white hover:bg-red-800" href={entry.url} target="_blank" rel="noreferrer">Open URL</a></div>}
        </div>
      ) : showRaw || !entry.data ? (
        <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-200">{JSON.stringify(entry.data, null, 2).slice(40000)}</pre>
      ) : (
        <ResultBody data={entry.data} kind={entry.kind} />
      )}

      <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/60 p-2 text-slate-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-slate-100">
        <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-brand-700 dark:text-brand-300">My study note</div>
        <textarea className="min-h-[60px] w-full rounded-lg border border-brand-200 bg-white p-2 text-sm text-slate-900 dark:border-brand-800 dark:bg-slate-900 dark:text-slate-100"
          placeholder="What did you learn? Exam pearls?" value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => onNoteChange(noteDraft)} />
      </div>
    </div>
  );
}

/* ---------- Renderers ---------- */
function ResultBody({ data, kind }: { data: any; kind: HealthApiKind }) {
  if (kind === 'openfda-ae' || data?.results?.[0]?.term) return <AdverseEventResults counts={data.results} total={data.meta?.results?.total} />;
  if (kind === 'openfda-recall' || data?.results?.[0]?.reason_for_recall) return <RecallResults results={data.results} total={data.meta?.results?.total} />;
  if (kind === 'openfda-label' || data?.results?.[0]?.indications_and_usage) return <LabelResults results={data.results} total={data.meta?.results?.total} />;
  if (kind === 'rxnav-ddi' || data?.interactionTypeGroup) return <DdiResults data={data} />;
  if (kind === 'umls' || data?.result?.results) return <UmlsResults results={data.result.results} />;
  if (Array.isArray(data?.results)) {
    const first = data.results[0];
    if (first?.term && first?.count) return <AdverseEventResults counts={data.results} />;
    if (first?.reason_for_recall) return <RecallResults results={data.results} />;
    if (first?.indications_and_usage) return <LabelResults results={data.results} />;
  }
  return <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-200">{JSON.stringify(data, null, 2).slice(20000)}</pre>;
}

type Tone = 'blue'|'green'|'red'|'amber'|'purple'|'pink'|'slate'|'teal';

// Each tone is an object of Tailwind classes. Text colours use !important so
// the global contrast safety net cannot wash them out on tinted dark-mode
// surfaces — this fixes the "white text on pink card" bug.
const TONE: Record<Tone, { card: string; title: string; strong: string }> = {
  blue: {
    card: 'border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950',
    title: 'text-sky-700 dark:text-sky-300',
    strong: 'text-sky-900 dark:!text-sky-100',
  },
  green: {
    card: 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950',
    title: 'text-emerald-700 dark:text-emerald-300',
    strong: 'text-emerald-900 dark:!text-emerald-100',
  },
  red: {
    card: 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950',
    title: 'text-red-700 dark:text-red-300',
    strong: 'text-red-900 dark:!text-red-100',
  },
  amber: {
    card: 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950',
    title: 'text-amber-700 dark:text-amber-300',
    strong: 'text-amber-900 dark:!text-amber-100',
  },
  purple: {
    card: 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950',
    title: 'text-violet-700 dark:text-violet-300',
    strong: 'text-violet-900 dark:!text-violet-100',
  },
  pink: {
    card: 'border-pink-400 bg-pink-50 dark:border-pink-700 dark:bg-pink-950',
    title: 'text-pink-700 dark:text-pink-300',
    strong: 'text-pink-900 dark:!text-pink-100',
  },
  slate: {
    card: 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800',
    title: 'text-slate-600 dark:text-slate-300',
    strong: 'text-slate-900 dark:!text-slate-100',
  },
  teal: {
    card: 'border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950',
    title: 'text-teal-700 dark:text-teal-300',
    strong: 'text-teal-900 dark:!text-teal-100',
  },
};

function Section({ title, children, tone = 'slate', heading }: { title: string; children: React.ReactNode; tone?: Tone; heading?: 'warning' | 'boxed' }) {
  if (!children || (Array.isArray(children) && children.every((c) => !c))) return null;
  const t = TONE[tone];
  return (
    <div className={`rounded-xl border-2 p-3 ${t.card} ${t.strong}`}>
      <div className={`mb-2 text-[11px] font-black uppercase tracking-widest ${t.title}`}>
        {heading === 'boxed' ? <span className="text-red-700 dark:text-red-300">BOXED WARNING</span>
         : heading === 'warning' ? <span>Warning</span>
         : title}
      </div>
      <div className="space-y-1.5 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

// Splits FDA free-text blocks into bullet lines (they often use "• " and "- "
// as list separators). Returns <p> for a plain paragraph, <ul> for bullets.
function renderBody(text: string) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  // Split on bullet markers (• - * and numbered "1. " patterns)
  const parts = cleaned.split(/\s+(?=[•\-\*]\s|\d+\.\s)/);
  if (parts.length > 1) {
    const items = parts.map((p) => p.replace(/^[•\-\*]\s*/, '').replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
    if (items.length > 1) {
      return (
        <ul className="list-disc space-y-1 pl-5">
          {items.slice(0, 12).map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );
    }
  }
  return <p>{cleaned.slice(0, 900)}</p>;
}

const first = (arr?: string[]) => arr?.[0] || '';

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'blue'|'green'|'red'|'amber'|'purple'|'pink'|'slate'|'teal' }) {
  const PILL: Record<Tone, string> = {
    blue:   'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100',
    green:  'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100',
    red:    'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100',
    amber:  'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100',
    purple: 'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100',
    pink:   'bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100',
    slate:  'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
    teal:   'bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PILL[tone]}`}>{children}</span>;
}

function Banner({ gradient, title }: { gradient: string; title: string }) {
  return <div className={`rounded-xl bg-gradient-to-r ${gradient} px-4 py-2 text-sm font-bold text-white shadow`}>{title}</div>;
}

function LabelResults({ results, total }: { results: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-sky-600 to-cyan-600" title={`${total ?? results.length} FDA label(s)`} />
      {results.slice(0, 2).map((r, i) => {
        const brand = r.openfda?.brand_name?.[0] || '';
        const generic = r.openfda?.generic_name?.[0] || 'Drug';
        const hasBoxed = !!r.boxed_warning?.[0];
        return (
          <div key={i} className="card space-y-2.5">
            <div className="border-b border-slate-200 pb-2 dark:border-slate-700">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {brand ? <span className="text-sky-700 dark:text-sky-300">{brand}</span> : <span className="text-sky-700 dark:text-sky-300">{generic}</span>}
                {brand && <span className="ml-2 text-sm font-semibold text-slate-500 dark:text-slate-400">({generic})</span>}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.openfda?.route?.[0] && <Pill tone="blue">{r.openfda.route[0]}</Pill>}
                {r.openfda?.dosage_form?.[0] && <Pill tone="teal">{r.openfda.dosage_form[0]}</Pill>}
                {r.openfda?.substance_name?.[0] && <Pill tone="purple">{r.openfda.substance_name[0]}</Pill>}
                {r.openfda?.rxcui?.[0] && <Pill tone="slate">RxCUI {r.openfda.rxcui[0]}</Pill>}
                {hasBoxed && <Pill tone="red">Boxed warning present</Pill>}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Section title="Indications & usage" tone="blue">{renderBody(first(r.indications_and_usage))}</Section>
              <Section title="Dosage & administration" tone="green">{renderBody(first(r.dosage_and_administration))}</Section>
              <Section title="" tone="red" heading={hasBoxed ? 'boxed' : 'warning'}>{renderBody(first(r.boxed_warning) || first(r.warnings))}</Section>
              <Section title="Contraindications" tone="red">{renderBody(first(r.contraindications))}</Section>
              <Section title="Adverse reactions" tone="amber">{renderBody(first(r.adverse_reactions))}</Section>
              <Section title="Drug interactions" tone="purple">{renderBody(first(r.drug_interactions))}</Section>
              <Section title="Pregnancy / lactation" tone="pink">{renderBody(first(r.pregnancy) || first(r.lactation))}</Section>
              <Section title="Patient counselling" tone="teal">{renderBody(first(r.patient_medication_information) || first(r.information_for_patients))}</Section>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdverseEventResults({ counts, total }: { counts: { term: string; count: number }[]; total?: number }) {
  const max = Math.max(...counts.map((c) => c.count), 1);
  const top = counts[0];
  return (
    <div className="space-y-3">
      <Banner gradient="from-rose-600 to-red-600" title={`Top adverse reactions (FAERS)${total ? ` · ${total.toLocaleString()}+ reports` : ''}`} />
      <div className="card">
        <div className="mb-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-2 text-xs font-bold text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100">
          FAERS is spontaneous reporting — it is not proof of causation. Use for hypothesis generation only; confirm with the label and a reference.
        </div>
        <div className="mb-3 text-sm font-bold text-rose-700 dark:text-rose-300">Most reported: <span className="text-rose-900 dark:text-rose-100">{top?.term}</span> <span className="font-normal opacity-70">({top?.count.toLocaleString()} reports)</span></div>
        <ul className="space-y-2">
          {counts.slice(0, 12).map((c, i) => {
            const pct = (c.count / max) * 100;
            const rank = i === 0 ? '1' : i === 1 ? '2' : i === 2 ? '3' : String(i + 1);
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-7 text-center text-xs font-black text-rose-700 dark:text-rose-300">{rank}</span>
                <span className="w-44 truncate font-bold">{c.term}</span>
                <span className="flex-1 rounded-full bg-slate-100 dark:bg-slate-700"><span className="block h-3 rounded-full bg-gradient-to-r from-rose-500 to-red-500" style={{ width: `${pct}%` }} /></span>
                <span className="w-16 text-right text-xs font-bold tabular-nums opacity-80">{c.count.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function RecallResults({ results, total }: { results: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-orange-600 to-red-600" title={`${total ?? results.length} recall / enforcement report(s)`} />
      {results.slice(0, 6).map((r, i) => {
        const cls = (r.classification || '').toLowerCase();
        const tone: Tone = cls.includes('class i') || cls === 'i' ? 'red' : cls.includes('class ii') || cls === 'ii' ? 'amber' : 'slate';
        return (
          <div key={i} className={`card border-l-4 ${tone === 'red' ? 'border-l-red-500' : tone === 'amber' ? 'border-l-amber-500' : 'border-l-slate-400'}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-base font-black text-slate-900 dark:text-white">{r.product_description?.split(';')[0] || 'Recalled product'}</span>
              {r.classification && <Pill tone={tone}>{r.classification}</Pill>}
              {r.status && <Pill tone="slate">{r.status}</Pill>}
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] font-bold opacity-80">
              {r.recalling_firm && <span>Firm: <span className="font-semibold">{r.recalling_firm}</span></span>}
              {r.report_date && <span>Date: <span className="font-semibold">{r.report_date}</span></span>}
              {r.state && <span>State: <span className="font-semibold">{r.state}</span></span>}
            </div>
            <div className="text-sm"><b className="text-red-700 dark:text-red-300">Reason: </b><span>{(r.reason_for_recall || '').replace(/\s+/g, ' ').trim().slice(0, 600)}</span></div>
          </div>
        );
      })}
    </div>
  );
}

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
      <Banner gradient="from-emerald-600 to-teal-600" title={`${pairs.length} interaction(s) · ${resolved.filter(r => r.cui).length}/${resolved.length} drugs resolved`} />
      {resolved.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-70">Drugs checked</div>
          <div className="flex flex-wrap gap-1.5">
            {resolved.map((r, i) => (
              <Pill key={i} tone={r.cui ? 'green' : 'red'}>{r.cui ? 'OK' : 'Not found'}: {r.name}{r.cui ? ` (${r.cui})` : ''}</Pill>
            ))}
          </div>
        </div>
      )}
      {pairs.length === 0 ? (
        <div className="card rounded-xl border-2 border-emerald-300 bg-emerald-50 font-semibold text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          No known interactions returned by RxNav.
          <p className="mt-1 text-xs font-normal opacity-80">This is not a guarantee of safety — always verify with BNF / AHFS / your formulary.</p>
        </div>
      ) : pairs.map((p, i) => {
        const sev = (p.severity || '').toLowerCase();
        const sevKey = (Object.keys(SEV_CHIP).find((k) => sev.includes(k)) || 'n/a');
        const cardTone: Tone = sevKey === 'high' || sevKey === 'severe' ? 'red' : sevKey === 'major' ? 'amber' : sevKey === 'moderate' ? 'amber' : sevKey === 'minor' ? 'blue' : 'slate';
        const t = TONE[cardTone];
        return (
          <div key={i} className={`rounded-xl border-2 p-3 ${t.card} ${t.strong}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${SEV_CHIP[sevKey]}`}>{p.severity}</span>
              <span className="font-black">{p.pair.join(' ⟷ ')}</span>
            </div>
            <p className="text-[13px] leading-relaxed">{p.description.replace(/\s+/g, ' ').trim()}</p>
          </div>
        );
      })}
      <div className="rounded-lg bg-slate-100 p-2 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">For educational use only. Verify with your hospital formulary, BNF/AHFS, and ask your preceptor.</div>
    </div>
  );
}

function UmlsResults({ results }: { results: any[] }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-violet-600 to-fuchsia-600" title={`${results.length} UMLS concept(s)`} />
      <div className="card space-y-2">
        {results.slice(0, 20).map((r: any, i: number) => (
          <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">{i + 1}. {r.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {r.ui && <Pill tone="purple">CUI {r.ui}</Pill>}
                {r.rootSource && <Pill tone="slate">{r.rootSource}</Pill>}
              </div>
            </div>
            {r.uri && <a className="text-xs font-bold text-violet-700 hover:underline dark:text-violet-300" href={r.uri} target="_blank" rel="noreferrer">Open</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
