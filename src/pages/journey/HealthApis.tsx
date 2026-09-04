import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { useNavigate } from 'react-router-dom';
import { JourneyAiButton } from '../../components/JourneyAiButton';
import { useData } from '../../stores/data';
import { useHealthApiStore, HealthApiEntry, HealthApiKind, HealthApiSource } from '../../stores/healthApiStore';
import { openFda, rxNav, umls, webmd } from '../../services/healthApiClients';

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">{children}</kbd>;
}

type TabId = HealthApiSource;

const TABS: { id: TabId; icon: string; label: string; color: string; ring: string }[] = [
  { id: 'openfda', icon: '💊', label: 'openFDA',       color: 'from-sky-500 to-cyan-500',       ring: 'ring-sky-500/40' },
  { id: 'rxnav',   icon: '🔗', label: 'RxNav',         color: 'from-emerald-500 to-teal-500',   ring: 'ring-emerald-500/40' },
  { id: 'umls',    icon: '📖', label: 'UMLS',          color: 'from-violet-500 to-fuchsia-500', ring: 'ring-violet-500/40' },
  { id: 'webmd',   icon: '🌐', label: 'RxList/WebMD',  color: 'from-orange-500 to-rose-500',    ring: 'ring-orange-500/40' },
];

const SOURCE_META: Record<TabId, { label: string; icon: string; accent: string }> = {
  openfda: { label: 'openFDA',     icon: '💊', accent: 'sky' },
  rxnav:   { label: 'RxNav',       icon: '🔗', accent: 'emerald' },
  umls:    { label: 'UMLS',        icon: '📖', accent: 'violet' },
  webmd:   { label: 'RxList/WebMD', icon: '🌐', accent: 'orange' },
};

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string; chipBg: string }> = {
  high:     { bg: 'bg-red-100 dark:bg-red-950/60',     border: 'border-red-400 dark:border-red-700',   text: 'text-red-900 dark:text-red-100',       chipBg: 'bg-red-600 text-white' },
  severe:   { bg: 'bg-red-100 dark:bg-red-950/60',     border: 'border-red-400 dark:border-red-700',   text: 'text-red-900 dark:text-red-100',       chipBg: 'bg-red-600 text-white' },
  major:    { bg: 'bg-orange-100 dark:bg-orange-950/60', border: 'border-orange-400 dark:border-orange-700', text: 'text-orange-900 dark:text-orange-100', chipBg: 'bg-orange-600 text-white' },
  moderate: { bg: 'bg-amber-100 dark:bg-amber-950/60', border: 'border-amber-400 dark:border-amber-700', text: 'text-amber-900 dark:text-amber-100',   chipBg: 'bg-amber-600 text-white' },
  minor:    { bg: 'bg-sky-100 dark:bg-sky-950/60',     border: 'border-sky-400 dark:border-sky-700',   text: 'text-sky-900 dark:text-sky-100',       chipBg: 'bg-sky-600 text-white' },
  'n/a':    { bg: 'bg-slate-100 dark:bg-slate-800',    border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-900 dark:text-slate-100',   chipBg: 'bg-slate-600 text-white' },
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
  const [tagEditor, setTagEditor] = useState<{ id: string; draft: string } | null>(null);
  const [labelEditId, setLabelEditId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const keys = useMemo(() => settings?.healthApis ?? {}, [settings?.healthApis]);
  const hasKey = (id: string) => !!(keys[id]?.key?.trim() && keys[id]?.enabled);

  const history = useMemo(
    () => filtered({ scope: historyScope, search: historySearch }),
    [filtered, historyScope, historySearch, entries]
  );

  function resetResult() { setCurrent(null); setErr(''); setDirectUrl(''); setShowRaw(false); }

  function loadSaved(e: HealthApiEntry) {
    setCurrent(e);
    setTab(e.source);
    setErr(e.error || '');
    setDirectUrl(e.url || '');
    setShowRaw(false);
    setHistoryOpen(false);
  }

  async function runQuery(source: HealthApiSource, kind: HealthApiKind, query: Record<string, any>, title: string, promise: Promise<any>) {
    setBusy(true); setErr(''); setDirectUrl(''); setShowRaw(false);
    try {
      const r = await promise as any;
      if (!r.ok) {
        setErr(r.error || 'Request failed');
        setDirectUrl(r.url || '');
        addEntry({ source, kind, query, title, url: r.url, data: null, error: r.error || 'Request failed' });
        return;
      }
      const entry = addEntry({ source, kind, query, title, url: r.url, data: r.data });
      setCurrent(entry);
      setDirectUrl(r.url || '');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong');
      addEntry({ source, kind, query, title, data: null, error: e?.message || 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  const favCount = entries.filter((e) => e.favorite).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="🩺 My Health APIs"
        subtitle={<>⚡ Fast clinical lookups — saved automatically for offline study. ⭐ favourites, tag, label for exams. Shortcut: <Kbd>g</Kbd> <Kbd>y</Kbd> or <Kbd>Ctrl/⌘+Shift+H</Kbd>.</>}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="health-apis"
              prompt="Using my configured Health APIs, help me study: suggest how to combine openFDA, RxNav and UMLS to verify a drug fact, give example queries, and point out licensing limits."
            />
            <button className="btn-secondary" onClick={() => setHistoryOpen(true)}>
              📚 History <span className="ml-1 rounded-full bg-slate-300 px-1.5 text-[10px] font-bold dark:bg-slate-600">{entries.length}</span>
            </button>
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
                  ? `border-transparent bg-gradient-to-r ${t.color} text-white shadow ring-2 ${t.ring}`
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <span>{t.icon}</span><span>{t.label}</span>
              {!ready && <span className="ml-0.5 rounded-full bg-white/25 px-1 text-[9px]">🔑</span>}
            </button>
          );
        })}
      </div>

      {busy && (
        <div className="card flex items-center gap-2 text-sm">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span className="font-bold">Fetching…</span>
          <span className="opacity-70">live call — usually under a second. Saved to history automatically.</span>
        </div>
      )}

      {/* Panels */}
      {tab === 'openfda' && <OpenFdaPanel busy={busy} runQuery={runQuery} keys={keys} />}
      {tab === 'rxnav' && <RxNavPanel busy={busy} runQuery={runQuery} />}
      {tab === 'umls' && <UmlsPanel busy={busy} runQuery={runQuery} umlsKey={keys.umls?.key ?? ''} />}
      {tab === 'webmd' && <WebMdPanel />}

      {/* Error */}
      {err && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100">
          <div className="font-bold">⚠️ {err}</div>
          {directUrl && (
            <a className="mt-2 inline-block rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700" href={directUrl} target="_blank" rel="noreferrer">
              Open URL in new tab ↗
            </a>
          )}
        </div>
      )}

      {/* Result */}
      {current && !busy && (
        <ResultCard
          entry={current}
          showRaw={showRaw}
          onToggleRaw={() => setShowRaw(!showRaw)}
          onToggleFav={() => toggleFavorite(current.id)}
          onRemove={() => { removeEntry(current.id); setCurrent(null); }}
          onLabelChange={(title) => updateEntry(current.id, { title })}
          onTagsChange={(tags) => updateEntry(current.id, { tags })}
          onNoteChange={(note) => updateEntry(current.id, { note })}
          tagEditor={tagEditor?.id === current.id ? tagEditor.draft : null}
          setTagEditor={(d) => setTagEditor(d === null ? null : { id: current.id, draft: d })}
          labelEditing={labelEditId === current.id}
          setLabelEditing={(editing, draft) => {
            if (editing) { setLabelEditId(current.id); setLabelDraft(draft ?? current.title); }
            else { if (labelDraft.trim()) updateEntry(current.id, { title: labelDraft.trim() }); setLabelEditId(null); }
          }}
          labelDraft={labelDraft}
          setLabelDraft={setLabelDraft}
        />
      )}

      {/* History drawer */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`📚 Health API history (${entries.length})`} wide>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 min-w-40" placeholder="Search title, tag, query…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
            <button className="btn-secondary" onClick={() => { if (confirm('Clear all history? Favorites will also be removed.')) clearHistory(); }}>🗑 Clear all</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([['all', `All (${entries.length})`], ['favorites', `★ Favourites (${favCount})`], ...TABS.map((t) => [t.id, `${t.icon} ${t.label}`] as const)] as const).map(([k, label]) => (
              <button key={k} onClick={() => setHistoryScope(k as any)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${historyScope === k ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {history.length === 0 && <p className="rounded-lg bg-slate-100 p-4 text-center text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">No saved lookups yet — run a search and it'll appear here (works offline).</p>}
            {history.map((e) => (
              <button key={e.id} onClick={() => loadSaved(e)}
                className={`flex w-full items-start justify-between gap-2 rounded-lg border p-2 text-left text-sm transition hover:border-brand-400 ${current?.id === e.id ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>{e.favorite ? '⭐' : SOURCE_META[e.source].icon}</span>
                    <span className="truncate font-bold">{e.title}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] opacity-70">
                    <span>{new Date(e.createdAt).toLocaleString()}</span>
                    {e.tags.map((t) => <span key={t} className="rounded bg-slate-200 px-1 font-semibold dark:bg-slate-700">#{t}</span>)}
                    {e.error && <span className="rounded bg-red-200 px-1 font-bold text-red-800 dark:bg-red-900/60 dark:text-red-200">error</span>}
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

/* ---------- Input panels ---------- */
function OpenFdaPanel({ busy, runQuery, keys }: { busy: boolean; runQuery: Function; keys: Record<string, any> }) {
  const [drug, setDrug] = useState('');
  const q = drug.trim();
  const canGo = !!q && !busy;
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-sky-700 dark:text-sky-300">💊 openFDA — U.S. Food & Drug Administration</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug (generic fastest) — e.g. amlodipine, metformin" value={drug} onChange={(e) => setDrug(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canGo && runQuery('openfda', 'openfda-label', { query: q }, `💊 Label — ${q}`, openFda.searchLabels(q, () => keys, 3))} />
        <button className="btn-primary" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-label', { query: q }, `💊 Label — ${q}`, openFda.searchLabels(q, () => keys, 3))}>🔎 Drug label</button>
        <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-ae', { drug: q }, `⚠️ Adverse — ${q}`, openFda.adverseEvents(q, () => keys, 10))}>⚠️ Adverse reactions</button>
        <button className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40" disabled={!canGo} onClick={() => runQuery('openfda', 'openfda-recall', { query: q }, `🚨 Recalls — ${q}`, openFda.recalls(q, () => keys, 5))}>🚨 Recalls</button>
      </div>
      <p className="text-[11px] opacity-70">Use generic names for fastest results (e.g. <b>amLODIPine</b>, not "Norvasc"). Results auto-saved for offline review.</p>
    </div>
  );
}

function RxNavPanel({ busy, runQuery }: { busy: boolean; runQuery: Function }) {
  const [drugs, setDrugs] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  function add() { const v = draft.trim(); if (v) { setDrugs([...drugs, v]); setDraft(''); } }
  function remove(i: number) { setDrugs(drugs.filter((_, j) => j !== i)); }
  function checkInteractions() {
    if (drugs.length < 2) return;
    runQuery('rxnav', 'rxnav-ddi', { drugs: [...drugs] }, `🔗 DDI — ${drugs.join(' + ')}`, (async () => {
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
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">🔗 RxNav — NIH/NLM interactions (parallel lookups)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Add drug (generic) — Enter" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && draft.trim() && add()} />
        <button className="btn-secondary" onClick={add} disabled={!draft.trim()}>＋ Add</button>
        <button className="btn-primary" disabled={busy || drugs.length < 2} onClick={checkInteractions}>🔗 Check interactions</button>
      </div>
      {drugs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {drugs.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
              💊 {d}
              <button onClick={() => remove(i)} className="text-emerald-800 hover:text-red-600 dark:text-emerald-200">✕</button>
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
        <div className="text-sm font-bold text-violet-700 dark:text-violet-300">🔑 UMLS requires a free UTS API key</div>
        <p className="mt-2 text-sm">Add it in <b>⚙️ Settings → Health APIs</b> to search SNOMED CT / ICD-10 / RxNorm / MeSH.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => { (window as any).location.hash = '#/settings?section=healthApis'; }}>⚙️ Go to Settings</button>
          <a className="btn-primary" href="https://uts.nlm.nih.gov/uts/" target="_blank" rel="noreferrer">Get free UMLS account →</a>
        </div>
      </div>
    );
  }
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">📖 UMLS — terminology (SNOMED, ICD-10, RxNorm, MeSH)</div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Term (e.g. hypertension, STEMI, amlodipine)" value={term} onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && term.trim() && runQuery('umls', 'umls', { term, sab }, `📖 UMLS — ${term}${sab ? ' (' + sab + ')' : ''}`, umls.searchConcept(term.trim(), sab, umlsKey, 15))} />
        <select className="input" value={sab} onChange={(e) => setSab(e.target.value)}>
          <option value="">All vocabularies</option>
          <option value="SNOMEDCT_US">SNOMED CT (US)</option>
          <option value="ICD10CM">ICD-10-CM</option>
          <option value="RXNORM">RxNorm</option>
          <option value="MSH">MeSH</option>
          <option value="MDR">MedDRA</option>
        </select>
        <button className="btn-primary" disabled={busy || !term.trim()} onClick={() => runQuery('umls', 'umls', { term, sab }, `📖 UMLS — ${term}${sab ? ' (' + sab + ')' : ''}`, umls.searchConcept(term.trim(), sab, umlsKey, 15))}>📖 Search</button>
      </div>
    </div>
  );
}

function WebMdPanel() {
  const [query, setQuery] = useState('');
  const [drugs, setDrugs] = useState<string[]>([]);
  const [d, setD] = useState('');
  function addDrug() { const v = d.trim(); if (v) { setDrugs([...drugs, v]); setD(''); } }
  const q = query.trim();
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold text-orange-700 dark:text-orange-300">🌐 RxList / WebMD — patient-friendly monographs</div>
      <p className="text-xs opacity-80">WebMD has no public JSON API, so Clinical Rx builds deep links that open in a new tab — perfect for <b>Drug Talk</b> practice.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Drug or condition" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q && window.open(webmd.drugSearchUrl(q), '_blank')} />
        <a className="btn-primary" target="_blank" rel="noreferrer" href={q ? webmd.drugSearchUrl(q) : '#'}>📘 Monograph</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={q ? webmd.conditionSearchUrl(q) : '#'}>🔍 Condition</a>
      </div>
      <div>
        <div className="label mb-1">Interaction checker</div>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder="Drug name" value={d} onChange={(e) => setD(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && d.trim() && addDrug()} />
          <button className="btn-secondary" disabled={!d.trim()} onClick={addDrug}>＋ Add</button>
        </div>
        {drugs.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {drugs.map((x, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-900 dark:bg-orange-950/60 dark:text-orange-100">
                  💊 {x} <button onClick={() => setDrugs(drugs.filter((_, j) => j !== i))} className="text-orange-800 hover:text-red-600 dark:text-orange-200">✕</button>
                </span>
              ))}
            </div>
            <a className="btn-primary mt-2 inline-block" target="_blank" rel="noreferrer" href={webmd.interactionsCheckUrl(drugs)}>⚠️ Open RxList interaction checker</a>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Result card ---------- */
function ResultCard(props: {
  entry: HealthApiEntry;
  showRaw: boolean;
  onToggleRaw: () => void;
  onToggleFav: () => void;
  onRemove: () => void;
  onLabelChange: (t: string) => void;
  onTagsChange: (t: string[]) => void;
  onNoteChange: (n: string) => void;
  tagEditor: string | null;
  setTagEditor: (d: string | null) => void;
  labelEditing: boolean;
  setLabelEditing: (editing: boolean, draft?: string) => void;
  labelDraft: string;
  setLabelDraft: (d: string) => void;
}) {
  const { entry, showRaw, onToggleRaw, onToggleFav, onRemove, onLabelChange, onTagsChange, onNoteChange,
    tagEditor, setTagEditor, labelEditing, setLabelEditing, labelDraft, setLabelDraft } = props;

  function addTagFromEditor() {
    const v = (tagEditor || '').trim().replace(/^#/, '');
    if (v && !entry.tags.includes(v)) onTagsChange([...entry.tags, v]);
    setTagEditor(null);
  }

  return (
    <div className="space-y-2">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button onClick={onToggleFav} title={entry.favorite ? 'Remove favourite' : 'Add to favourites'}
            className="text-xl transition hover:scale-110">{entry.favorite ? '⭐' : '☆'}</button>
          {labelEditing ? (
            <input autoFocus className="input flex-1 py-1 text-sm" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => setLabelEditing(false)} onKeyDown={(e) => { if (e.key === 'Enter') setLabelEditing(false); if (e.key === 'Escape') setLabelEditing(false); }} />
          ) : (
            <button onClick={() => setLabelEditing(true, entry.title)} className="min-w-0 flex-1 truncate text-left text-sm font-bold hover:underline" title="Click to rename">
              {entry.title}
            </button>
          )}
          <span className="shrink-0 text-[10px] opacity-60">{new Date(entry.createdAt).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {entry.url && <a className="rounded bg-slate-200 px-2 py-1 text-xs font-bold hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600" href={entry.url} target="_blank" rel="noreferrer">Raw ↗</a>}
          <button onClick={onToggleRaw} className="rounded bg-slate-200 px-2 py-1 text-xs font-bold hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">{showRaw ? 'Pretty view' : 'Raw JSON'}</button>
          <button onClick={onRemove} className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60">🗑</button>
        </div>
      </div>

      {/* Tag bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2 dark:bg-slate-900/40">
        <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Tags:</span>
        {entry.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-900/50 dark:text-brand-100">
            #{t}
            <button onClick={() => onTagsChange(entry.tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">✕</button>
          </span>
        ))}
        {tagEditor !== null ? (
          <input autoFocus className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800" placeholder="tag…" value={tagEditor}
            onChange={(e) => setTagEditor(e.target.value)}
            onBlur={addTagFromEditor}
            onKeyDown={(e) => { if (e.key === 'Enter') addTagFromEditor(); if (e.key === 'Escape') setTagEditor(null); }} />
        ) : (
          <button onClick={() => setTagEditor('')} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-bold opacity-70 hover:opacity-100 dark:border-slate-600">＋ tag</button>
        )}
      </div>

      {/* Body */}
      {entry.error ? (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100">
          <b>⚠️ {entry.error}</b>
          {entry.url && <div className="mt-2"><a className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700" href={entry.url} target="_blank" rel="noreferrer">Open URL ↗</a></div>}
        </div>
      ) : showRaw || !entry.data ? (
        <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-200">{JSON.stringify(entry.data, null, 2).slice(40000)}</pre>
      ) : (
        <ResultBody data={entry.data} kind={entry.kind} />
      )}

      {/* Personal note */}
      <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/60 p-2 dark:border-brand-800 dark:bg-brand-950/30">
        <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-brand-700 dark:text-brand-300">📝 My study note</div>
        <textarea
          className="min-h-[60px] w-full rounded-lg border border-brand-200 bg-white p-2 text-sm text-slate-900 dark:border-brand-800 dark:bg-slate-900 dark:text-slate-100"
          placeholder="What did you learn? Any exam pearls?"
          defaultValue={entry.note || ''}
          onBlur={(e) => onNoteChange(e.target.value)}
        />
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

function Section({ title, children, tone = 'slate' }: { title: string; children: React.ReactNode; tone?: 'blue'|'green'|'red'|'amber'|'purple'|'pink'|'slate'|'teal' }) {
  if (!children || (Array.isArray(children) && children.every((c) => !c))) return null;
  const tones: Record<string, string> = {
    blue:   'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-50',
    green:  'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-50',
    red:    'border-red-300 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950/50 dark:text-red-50',
    amber:  'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50',
    purple: 'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-50',
    pink:   'border-pink-300 bg-pink-50 text-pink-950 dark:border-pink-700 dark:bg-pink-950/50 dark:text-pink-50',
    slate:  'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    teal:   'border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-50',
  };
  const titleTone: Record<string, string> = {
    blue: 'text-sky-700 dark:text-sky-300', green: 'text-emerald-700 dark:text-emerald-300',
    red: 'text-red-700 dark:text-red-300', amber: 'text-amber-700 dark:text-amber-300',
    purple: 'text-violet-700 dark:text-violet-300', pink: 'text-pink-700 dark:text-pink-300',
    slate: 'text-slate-500 dark:text-slate-400', teal: 'text-teal-700 dark:text-teal-300',
  };
  return (
    <div className={`rounded-xl border-2 p-3 ${tones[tone]}`}>
      <div className={`mb-1.5 text-[11px] font-black uppercase tracking-widest ${titleTone[tone]}`}>● {title}</div>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

const cleanText = (s: string, max = 800) => s ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const first = (arr?: string[]) => arr?.[0] || '';

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'blue'|'green'|'red'|'amber'|'purple'|'pink'|'slate'|'teal' }) {
  const tones: Record<string, string> = {
    blue:   'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100',
    green:  'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100',
    red:    'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100',
    amber:  'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100',
    purple: 'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100',
    pink:   'bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100',
    slate:  'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
    teal:   'bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

function LabelResults({ results, total }: { results: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow">💊 {total ?? results.length} FDA label(s)</div>
      {results.slice(0, 2).map((r, i) => {
        const brand = r.openfda?.brand_name?.[0] || '';
        const generic = r.openfda?.generic_name?.[0] || 'Drug';
        return (
          <div key={i} className="card space-y-2.5">
            <div className="border-b border-slate-200 pb-2 dark:border-slate-700">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {brand ? <span className="text-sky-600 dark:text-sky-400">{brand}</span> : <span className="text-sky-600 dark:text-sky-400">{generic}</span>}
                {brand && <span className="ml-2 text-sm font-normal opacity-70">({generic})</span>}
              </h3>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.openfda?.route?.[0] && <Pill tone="blue">{r.openfda.route[0]}</Pill>}
                {r.openfda?.dosage_form?.[0] && <Pill tone="teal">{r.openfda.dosage_form[0]}</Pill>}
                {r.openfda?.substance_name?.[0] && <Pill tone="purple">{r.openfda.substance_name[0]}</Pill>}
                {r.openfda?.rxcui?.[0] && <Pill tone="slate">RxCUI {r.openfda.rxcui[0]}</Pill>}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Section title="Indications & usage" tone="blue"><p>{cleanText(first(r.indications_and_usage), 800)}</p></Section>
              <Section title="Dosage & administration" tone="green"><p>{cleanText(first(r.dosage_and_administration), 800)}</p></Section>
              <Section title={r.boxed_warning?.[0] ? '⚠️ BOXED WARNING' : 'Warnings'} tone="red"><b>{cleanText(first(r.boxed_warning) || first(r.warnings), 900)}</b></Section>
              <Section title="Contraindications" tone="red"><p>{cleanText(first(r.contraindications), 600)}</p></Section>
              <Section title="Adverse reactions" tone="amber"><p>{cleanText(first(r.adverse_reactions), 800)}</p></Section>
              <Section title="Drug interactions" tone="purple"><p>{cleanText(first(r.drug_interactions), 700)}</p></Section>
              <Section title="Pregnancy / lactation" tone="pink"><p>{cleanText(first(r.pregnancy) || first(r.lactation), 600)}</p></Section>
              <Section title="Patient counselling 🗣️" tone="teal"><p>{cleanText(first(r.patient_medication_information) || first(r.information_for_patients), 800)}</p></Section>
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
      <div className="rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-sm font-bold text-white shadow">⚠️ Top adverse reactions (FAERS){total ? ` · ${total.toLocaleString()}+ reports` : ''}</div>
      <div className="card">
        <div className="mb-2 rounded-lg bg-rose-100 p-2 text-xs font-bold text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
          FAERS is spontaneous reporting — <u>not proof of causation</u>. Hypotheses only; confirm with label + reference.
        </div>
        <div className="mb-2 text-sm font-bold">🏆 #1: <span className="text-rose-600 dark:text-rose-400">{top?.term}</span> <span className="opacity-70">({top?.count.toLocaleString()} reports)</span></div>
        <ul className="space-y-1.5">
          {counts.slice(0, 12).map((c, i) => {
            const pct = (c.count / max) * 100;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-center text-xs font-bold opacity-70">{medal}</span>
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
      <div className="rounded-xl bg-gradient-to-r from-orange-600 to-red-600 px-4 py-2 text-sm font-bold text-white shadow">🚨 {total ?? results.length} recall/enforcement report(s)</div>
      {results.slice(0, 6).map((r, i) => {
        const cls = (r.classification || '').toLowerCase();
        const tone = cls.includes('i') ? 'red' : cls.includes('ii') ? 'amber' : 'slate';
        return (
          <div key={i} className={`card border-l-4 ${tone === 'red' ? 'border-l-red-500' : tone === 'amber' ? 'border-l-amber-500' : 'border-l-slate-400'}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-base font-black">{r.product_description?.split(';')[0] || 'Recalled product'}</span>
              {r.classification && <Pill tone={tone as any}>Class {r.classification.replace('Class ', '')}</Pill>}
              {r.status && <Pill tone="slate">{r.status}</Pill>}
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] font-bold opacity-80">
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
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow">🔗 {pairs.length} interaction(s) · {resolved.filter(r => r.cui).length}/{resolved.length} drugs resolved</div>
      {resolved.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-bold opacity-70">Drugs checked:</div>
          <div className="flex flex-wrap gap-1.5">
            {resolved.map((r, i) => (
              <Pill key={i} tone={r.cui ? 'green' : 'red'}>{r.cui ? '✓' : '✕'} {r.name}{r.cui ? ` (${r.cui})` : ' — not found'}</Pill>
            ))}
          </div>
        </div>
      )}
      {pairs.length === 0 ? (
        <div className="card rounded-xl border-2 border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-50">
          <b>✓ No known interactions returned by RxNav.</b>
          <p className="mt-1 text-xs opacity-80">Not a guarantee of safety — verify with BNF/AHFS/your formulary.</p>
        </div>
      ) : pairs.map((p, i) => {
        const sev = (p.severity || '').toLowerCase();
        const sevKey = (Object.keys(SEVERITY_COLORS).find((k) => sev.includes(k)) || 'n/a') as keyof typeof SEVERITY_COLORS;
        const c = SEVERITY_COLORS[sevKey];
        return (
          <div key={i} className={`rounded-xl border-2 p-3 ${c.bg} ${c.border} ${c.text}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${c.chipBg}`}>{p.severity}</span>
              <span className="font-black">{p.pair.join(' ⟷ ')}</span>
            </div>
            <p className="text-[13px] leading-relaxed">{p.description}</p>
          </div>
        );
      })}
      <div className="rounded-lg bg-slate-100 p-2 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">📚 Educational use only.</div>
    </div>
  );
}

function UmlsResults({ results }: { results: any[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow">📖 {results.length} UMLS concept(s)</div>
      <div className="card space-y-2">
        {results.slice(0, 20).map((r: any, i: number) => (
          <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div>
              <div className="font-bold">{i + 1}. {r.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {r.ui && <Pill tone="purple">CUI {r.ui}</Pill>}
                {r.rootSource && <Pill tone="slate">{r.rootSource}</Pill>}
              </div>
            </div>
            {r.uri && <a className="text-xs font-bold text-violet-600 hover:underline dark:text-violet-400" href={r.uri} target="_blank" rel="noreferrer">↗</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
