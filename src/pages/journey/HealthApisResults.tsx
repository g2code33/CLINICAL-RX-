import { useEffect, useState } from 'react';
import { useHealthApiStore } from '../../stores/healthApiStore';

/* ---------- Result card ---------- */
export function ResultCard(props: {
  entryId: string; showRaw: boolean; onToggleRaw: () => void;
  onRemove: () => void;
  onLabelChange: (t: string) => void; onTagsChange: (t: string[]) => void; onNoteChange: (n: string) => void;
  toggleFavorite: () => void;
}) {
  const { entryId, showRaw, onToggleRaw, onRemove, onLabelChange, onTagsChange, onNoteChange, toggleFavorite } = props;
  const entry = useHealthApiStore((s) => s.entries.find((e) => e.id === entryId));
  const [tagDraft, setTagDraft] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => { setNoteDraft(entry?.note || ''); }, [entry?.id, entry?.note]);
  useEffect(() => { setLabelDraft(entry?.title || ''); }, [entry?.id, entry?.title]);
  if (!entry) return null;

  function addTag() {
    const v = tagDraft.trim().replace(/^#/, '');
    if (entry && v && !entry.tags.includes(v)) onTagsChange([...entry.tags, v]);
    setTagDraft(''); setTagOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-2 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button onClick={toggleFavorite} title={entry.favorite ? 'Remove favourite' : 'Add to favourites'}
            className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${entry.favorite ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100'}`}>
            {entry.favorite ? 'Favourited' : 'Favourite'}
          </button>
          {labelEditing ? (
            <input autoFocus className="input flex-1 py-1 text-sm" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => { if (labelDraft.trim()) onLabelChange(labelDraft.trim()); setLabelEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { if (labelDraft.trim()) onLabelChange(labelDraft.trim()); setLabelEditing(false); } }} />
          ) : (
            <button onClick={() => { setLabelDraft(entry.title); setLabelEditing(true); }} className="min-w-0 flex-1 truncate text-left text-sm font-bold hover:underline">
              <span className="mr-1.5 rounded bg-slate-300 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-900 dark:bg-slate-600 dark:text-slate-100">{(entry as any).source}</span>
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

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2 text-slate-900 dark:bg-slate-900/40 dark:text-slate-100">
        <span className="text-[11px] font-black uppercase tracking-widest opacity-70">Tags</span>
        {entry.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-900 dark:bg-brand-900 dark:text-brand-100">
            #{t}
            <button onClick={() => onTagsChange(entry.tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">×</button>
          </span>
        ))}
        {tagOpen ? (
          <input autoFocus className="w-28 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800" placeholder="tag…" value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)} onBlur={addTag}
            onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setTagOpen(false); }} />
        ) : (
          <button onClick={() => { setTagDraft(''); setTagOpen(true); }} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-bold opacity-70 hover:opacity-100 dark:border-slate-600">+ Add tag</button>
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
function ResultBody({ data, kind }: { data: any; kind: string }) {
  if (kind === 'openfda-ae' || (data?.results && Array.isArray(data.results) && data.results[0]?.term && typeof data.results[0]?.count === 'number')) return <AdverseEventResults counts={data.results} total={data.meta?.results?.total} />;
  if (kind === 'openfda-recall' || (data?.results && data.results[0]?.reason_for_recall)) return <RecallResults results={data.results} total={data.meta?.results?.total} />;
  if (kind === 'openfda-label' || data?.results?.[0]?.indications_and_usage) return <LabelResults results={data.results} total={data.meta?.results?.total} />;
  if (kind === 'rxnav-ddi' || data?.interactionTypeGroup || data?._pairs) return <DdiResults data={data} />;
  if (kind === 'rxnav-info' || data?.rxcui) return <RxNavInfoResults data={data} />;
  if (kind === 'umls' || data?.result?.results) return <UmlsResults results={data.result.results} />;
  if (kind === 'rxnav-ddi' && data?.data) return <DdiResults data={data.data} />;
  // DailyMed
  if (data?.data && Array.isArray(data.data)) return <DailyMedResults items={data.data} />;
  // PubMed
  if (Array.isArray(data?.results) && data.results[0]?.title && data.results[0]?.authors) return <PubmedResults articles={data.results} total={data.count} />;
  // DrugBank
  if (Array.isArray(data) && (data[0]?.drugbank_id || data[0]?.name)) return <DrugBankResults items={data} />;
  if (data?.drugs || Array.isArray(data)) {
    const arr = data.drugs || data;
    if (Array.isArray(arr) && arr[0]?.name) return <SimpleList title="Results" items={arr.map((x: any) => ({ title: x.name, sub: x.drugbank_id || x.id || '' }))} />;
  }
  // Infermedica parse
  if (data?.mentions || data?.observations) return <InfermedicaResults data={data} />;
  // EvidenceMD
  if (data?.answer || data?.result || typeof data === 'object') return <GenericJson title="Response" data={data} />;
  return <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-200">{JSON.stringify(data, null, 2).slice(20000)}</pre>;
}

type Tone = 'blue'|'green'|'red'|'amber'|'purple'|'pink'|'slate'|'teal';
const TONE: Record<Tone, { card: string; title: string }> = {
  blue:   { card: 'border-sky-400 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-50', title: 'text-sky-700 dark:text-sky-300' },
  green:  { card: 'border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50', title: 'text-emerald-700 dark:text-emerald-300' },
  red:    { card: 'border-red-400 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-50', title: 'text-red-700 dark:text-red-300' },
  amber:  { card: 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50', title: 'text-amber-700 dark:text-amber-300' },
  purple: { card: 'border-violet-400 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-50', title: 'text-violet-700 dark:text-violet-300' },
  pink:   { card: 'border-pink-400 bg-pink-50 text-pink-950 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-50', title: 'text-pink-700 dark:text-pink-300' },
  slate:  { card: 'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100', title: 'text-slate-600 dark:text-slate-300' },
  teal:   { card: 'border-teal-400 bg-teal-50 text-teal-950 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-50', title: 'text-teal-700 dark:text-teal-300' },
};

function Section({ title, children, tone = 'slate', heading }: { title: string; children: React.ReactNode; tone?: Tone; heading?: 'warning' | 'boxed' }) {
  if (!children || (Array.isArray(children) && children.every((c) => !c))) return null;
  const t = TONE[tone];
  return (
    <div className={`rounded-xl border-2 p-3 ${t.card}`}>
      <div className={`mb-2 text-[11px] font-black uppercase tracking-widest ${t.title}`}>
        {heading === 'boxed' ? <span className="text-red-700 dark:text-red-300">BOXED WARNING</span>
         : heading === 'warning' ? <span>Warning</span> : title}
      </div>
      <div className="space-y-1.5 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  const PILL: Record<Tone, string> = {
    blue: 'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100',
    green: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100',
    red: 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100',
    amber: 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100',
    purple: 'bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100',
    pink: 'bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100',
    slate: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
    teal: 'bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PILL[tone]}`}>{children}</span>;
}

function Banner({ gradient, title }: { gradient: string; title: string }) {
  return <div className={`rounded-xl bg-gradient-to-r ${gradient} px-4 py-2 text-sm font-bold text-white shadow`}>{title}</div>;
}

const cleanText = (s: string, max = 800) => s ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const first = (arr?: string[]) => arr?.[0] || '';

function bullets(text: string) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/\s+(?=[•\-\*]\s|\d+\.\s)/);
  if (parts.length > 1) {
    const items = parts.map((p) => p.replace(/^[•\-\*]\s*/, '').replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
    if (items.length > 1) return <ul className="list-disc space-y-1 pl-5">{items.slice(0, 12).map((it, i) => <li key={i}>{it}</li>)}</ul>;
  }
  return <p>{cleaned.slice(0, 900)}</p>;
}

function LabelResults({ results, total }: { results: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-sky-600 to-cyan-600" title={`${total ?? results.length} FDA label(s)`} />
      {results.slice(0, 2).map((r, i) => {
        const brand = r.openfda?.brand_name?.[0] || '';
        const generic = r.openfda?.generic_name?.[0] || 'Drug';
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
                {!!r.boxed_warning?.[0] && <Pill tone="red">Boxed warning present</Pill>}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Section title="Indications & usage" tone="blue">{bullets(first(r.indications_and_usage))}</Section>
              <Section title="Dosage & administration" tone="green">{bullets(first(r.dosage_and_administration))}</Section>
              <Section title="" tone="red" heading={r.boxed_warning?.[0] ? 'boxed' : 'warning'}>{bullets(first(r.boxed_warning) || first(r.warnings))}</Section>
              <Section title="Contraindications" tone="red">{bullets(first(r.contraindications))}</Section>
              <Section title="Adverse reactions" tone="amber">{bullets(first(r.adverse_reactions))}</Section>
              <Section title="Drug interactions" tone="purple">{bullets(first(r.drug_interactions))}</Section>
              <Section title="Pregnancy / lactation" tone="pink">{bullets(first(r.pregnancy) || first(r.lactation))}</Section>
              <Section title="Patient counselling" tone="teal">{bullets(first(r.patient_medication_information) || first(r.information_for_patients))}</Section>
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
        <div className="mb-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-2 text-xs font-bold text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100">FAERS = spontaneous reports, not proof of causation. Hypotheses only.</div>
        <div className="mb-3 text-sm font-bold text-rose-700 dark:text-rose-300">Most reported: <span className="text-rose-900 dark:text-rose-100">{top?.term}</span> <span className="font-normal opacity-70">({top?.count.toLocaleString()})</span></div>
        <ul className="space-y-2">
          {counts.slice(0, 12).map((c, i) => {
            const pct = (c.count / max) * 100;
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-center text-xs font-black text-rose-700 dark:text-rose-300">{i + 1}</span>
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
        const tone: Tone = (r.classification || '').toLowerCase().includes('class i') ? 'red' : (r.classification || '').toLowerCase().includes('class ii') ? 'amber' : 'slate';
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
            <div className="text-sm"><b className="text-red-700 dark:text-red-400">Reason:</b> {cleanText(r.reason_for_recall, 600)}</div>
          </div>
        );
      })}
    </div>
  );
}

function RxNavInfoResults({ data }: { data: any }) {
  const name = data.name || data.props?.name || 'Drug';
  const rxcui = data.rxcui || data.props?.rxcui;
  const brands: string[] = data.brands || [];
  const atc: { id: string; name: string }[] = data.atc || [];
  const va: { id: string; name: string }[] = data.va || [];
  const mesh: { id: string; name: string }[] = data.mesh || [];
  const mayTreat: { id: string; name: string }[] = data.mayTreat || [];
  const ciWith: { id: string; name: string }[] = data.ciWith || [];
  const snomed: { id: string; name: string }[] = data.snomed || [];
  return (
    <div className="space-y-3">
      <Banner gradient="from-emerald-600 to-teal-600" title={`Drug info — ${name}${rxcui ? ` (RxCUI ${rxcui})` : ''}`} />
      <div className="grid gap-2 md:grid-cols-2">
        {data.props && (
          <Section title="RxNorm properties" tone="slate">
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              <b>Name</b><span>{data.props.name}</span>
              <b>TTY</b><span>{data.props.tty}</span>
              {data.props.synonym && <><b>Synonym</b><span>{data.props.synonym}</span></>}
              {data.generic && <><b>Generic</b><span>{data.generic}</span></>}
            </div>
          </Section>
        )}
        {brands.length > 0 && (
          <Section title={`Brand / product names (${brands.length})`} tone="purple">
            <div className="flex flex-wrap gap-1.5">{brands.slice(0, 20).map((b, i) => <Pill key={i} tone="purple">{b}</Pill>)}</div>
          </Section>
        )}
        {atc.length > 0 && (
          <Section title="ATC class(es) (WHO Anatomical Therapeutic Chemical)" tone="blue">
            <ul className="space-y-1 text-sm">
              {atc.map((c, i) => <li key={i}><span className="font-mono text-[11px] opacity-70">{c.id}</span> — <b>{c.name}</b></li>)}
            </ul>
          </Section>
        )}
        {va.length > 0 && (
          <Section title="VA drug class(es)" tone="teal">
            <ul className="space-y-1 text-sm">{va.map((c, i) => <li key={i}><b>{c.name}</b> <span className="font-mono text-[11px] opacity-70">{c.id}</span></li>)}</ul>
          </Section>
        )}
        {mesh.length > 0 && (
          <Section title="MeSH terms" tone="blue">
            <div className="flex flex-wrap gap-1.5">{mesh.map((c, i) => <Pill key={i} tone="blue">{c.name}</Pill>)}</div>
          </Section>
        )}
        {mayTreat.length > 0 && (
          <Section title={`May treat (MED-RT) — ${mayTreat.length}`} tone="green">
            <div className="flex flex-wrap gap-1.5">{mayTreat.map((c, i) => <Pill key={i} tone="green">{c.name}</Pill>)}</div>
          </Section>
        )}
        {ciWith.length > 0 && (
          <Section title={`Contraindicated with (MED-RT)`} tone="red">
            <ul className="space-y-1 text-sm">{ciWith.map((c, i) => <li key={i}><b>{c.name}</b></li>)}</ul>
          </Section>
        )}
        {snomed.length > 0 && (
          <Section title="SNOMED structure / disposition" tone="slate">
            <ul className="space-y-1 text-sm">{snomed.map((c, i) => <li key={i}><b>{c.name}</b></li>)}</ul>
          </Section>
        )}
        {data.interactionsSummary && (
          <Section title="FDA label — drug_interactions (excerpt)" tone="amber">
            <p className="text-[13px] leading-relaxed">{data.interactionsSummary}</p>
          </Section>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui?rxcui=${rxcui}`}>Browse on RxNav</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://www.rxlist.com/search/rxl/${encodeURIComponent(name)}`}>RxList monograph</a>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(name)}`}>DailyMed search</a>
      </div>
    </div>
  );
}

function DdiResults({ data }: { data: any }) {
  // New RxNav-via-openFDA shape (NLM interaction endpoint discontinued Jan 2024):
  if (data?._pairs && Array.isArray(data._pairs)) {
    const resolved: { name: string; cui: string | null; ok?: boolean }[] = data._resolved || [];
    const links: { rxlist: string; drugscom: string; webmd: string } = data._links || {};
    const pairs: { a: string; b: string; sentences: string[]; found: boolean }[] = data._pairs || [];
    return (
      <div className="space-y-3">
        <Banner gradient="from-emerald-600 to-teal-600" title={`Drug interaction check · ${pairs.length} pair(s)`} />
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <b className="uppercase tracking-wider">Note:</b> NLM discontinued the RxNav Drug–Drug Interaction API on Jan 2, 2024. Results below extract the FDA-prescribing-information <code className="rounded bg-amber-200 px-1 dark:bg-amber-800">drug_interactions</code> section from openFDA labels and highlight sentences that mention the co-drug. Always confirm with a full checker (buttons below).
        </div>
        {resolved.length > 0 && (
          <div className="card">
            <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-70">Drugs checked</div>
            <div className="flex flex-wrap gap-1.5">
              {resolved.map((r: any, i: number) => <Pill key={i} tone={r.cui ? 'green' : 'red'}>{r.cui ? 'RxNorm OK' : 'Not found'}: {r.name}{r.cui ? ` (${r.cui})` : ''}</Pill>)}
            </div>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {pairs.map((p, i) => (
            <div key={i} className={`rounded-xl border-2 p-3 ${p.found ? 'border-red-400 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-50' : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50'}`}>
              <div className="mb-1 flex items-center gap-2">
                <Pill tone={p.found ? 'red' : 'green'}>{p.found ? 'Mentioned in FDA label' : 'No direct mention'}</Pill>
                <span className="font-black">{p.a} ⟷ {p.b}</span>
              </div>
              {p.found ? (
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
                  {p.sentences.map((s, j) => <li key={j}>{s}</li>)}
                </ul>
              ) : (
                <p className="text-[13px] leading-relaxed opacity-90">No sentence in the FDA <code>drug_interactions</code> section of either drug's label directly named the other. This does NOT mean it is safe — always verify with a full checker.</p>
              )}
            </div>
          ))}
        </div>
        <div className="card space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest opacity-70">Open in a full interaction checker</div>
          <div className="flex flex-wrap gap-2">
            {links.rxlist && <a className="btn-primary" href={links.rxlist} target="_blank" rel="noreferrer">RxList checker</a>}
            {links.drugscom && <a className="btn-secondary" href={links.drugscom} target="_blank" rel="noreferrer">Drugs.com checker</a>}
            {links.webmd && <a className="btn-secondary" href={links.webmd} target="_blank" rel="noreferrer">WebMD checker</a>}
          </div>
        </div>
        <div className="rounded-lg bg-slate-100 p-2 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Educational use only — not clinical advice.</div>
      </div>
    );
  }

  // Legacy RxNav shape (defensive; NLM endpoint is now 404)
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
  const severityTone = (s: string): Tone => { const l = s.toLowerCase(); if (l.includes('high') || l.includes('severe') || l.includes('contraindicated')) return 'red'; if (l.includes('major') || l.includes('serious')) return 'amber'; if (l.includes('moderate')) return 'amber'; if (l.includes('minor')) return 'blue'; return 'slate'; };
  return (
    <div className="space-y-3">
      <Banner gradient="from-emerald-600 to-teal-600" title={`${pairs.length} interaction(s) · ${resolved.filter(r => r.cui).length}/${resolved.length} drugs resolved`} />
      {resolved.length > 0 && (
        <div className="card">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-70">Drugs checked</div>
          <div className="flex flex-wrap gap-1.5">
            {resolved.map((r, i) => <Pill key={i} tone={r.cui ? 'green' : 'red'}>{r.cui ? 'OK' : 'Not found'}: {r.name}{r.cui ? ` (${r.cui})` : ''}</Pill>)}
          </div>
        </div>
      )}
      {pairs.length === 0 ? (
        <div className="card rounded-xl border-2 border-emerald-300 bg-emerald-50 font-semibold text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">No known interactions returned.<p className="mt-1 text-xs font-normal opacity-80">Not a guarantee of safety — verify with BNF/AHFS/formulary.</p></div>
      ) : pairs.map((p, i) => {
        const t = TONE[severityTone(p.severity)];
        return (
          <div key={i} className={`rounded-xl border-2 p-3 ${t.card}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">{p.severity}</span>
              <span className="font-black">{p.pair.join(' ⟷ ')}</span>
            </div>
            <p className="text-[13px] leading-relaxed">{p.description.replace(/\s+/g, ' ').trim()}</p>
          </div>
        );
      })}
      <div className="rounded-lg bg-slate-100 p-2 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Educational use only.</div>
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

function DailyMedResults({ items }: { items: any[] }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-indigo-600 to-sky-600" title={`${items.length} DailyMed SPL listing(s)`} />
      <div className="card space-y-2">
        {items.slice(0, 10).map((r: any, i: number) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{r.title || r.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] opacity-80">
                  {r.marketing_category && <Pill tone="blue">{r.marketing_category}</Pill>}
                  {r.label_type && <Pill tone="teal">{r.label_type}</Pill>}
                  {r.effective_time && <span>{r.effective_time}</span>}
                </div>
              </div>
              {r.setid && <a className="btn-secondary !py-1 text-[11px]" href={`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${r.setid}`} target="_blank" rel="noreferrer">Open SPL</a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PubmedResults({ articles, total }: { articles: any[]; total?: number }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-indigo-600 to-violet-600" title={`${total ?? articles.length} PubMed article(s)`} />
      <div className="card space-y-2">
        {articles.map((a: any, i: number) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <a href={a.url} target="_blank" rel="noreferrer" className="font-bold text-sky-700 hover:underline dark:text-sky-300">{a.title}</a>
            <div className="mt-0.5 text-[11px] opacity-80">{(a.authors || []).slice(0, 3).join(', ')}{a.authors?.length > 3 ? ' et al.' : ''} — <i>{a.source}</i>, {a.pubdate}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrugBankResults({ items }: { items: any[] }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-emerald-600 to-teal-600" title={`${items.length} DrugBank result(s)`} />
      <div className="card space-y-2">
        {items.slice(0, 10).map((r: any, i: number) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="font-bold text-slate-900 dark:text-white">{r.name} {r.drugbank_id && <span className="ml-1 text-xs font-mono opacity-60">{r.drugbank_id}</span>}</div>
            {r.description && <p className="mt-1 text-sm opacity-90">{cleanText(r.description, 500)}</p>}
            {r.categories && Array.isArray(r.categories) && r.categories.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.categories.slice(0, 5).map((c: string, j: number) => <Pill key={j} tone="teal">{c}</Pill>)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfermedicaResults({ data }: { data: any }) {
  const mentions = data.mentions || data.observations || [];
  return (
    <div className="space-y-3">
      <Banner gradient="from-emerald-600 to-teal-600" title={`Infermedica parse (${mentions.length} mention(s))`} />
      <div className="card space-y-2">
        {mentions.length === 0 && <p className="text-sm opacity-70">No symptoms/conditions identified in that text.</p>}
        {mentions.map((m: any, i: number) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{m.name || m.common_name || m.text}</span>
              {m.type && <Pill tone="purple">{m.type}</Pill>}
              {m.source && <Pill tone="slate">{m.source}</Pill>}
            </div>
            {(m.choices || m.suggested_tokens) && <div className="mt-1 text-xs opacity-80">{JSON.stringify(m.choices || m.suggested_tokens).slice(0, 200)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleList({ title, items }: { title: string; items: { title: string; sub?: string; url?: string }[] }) {
  return (
    <div className="space-y-3">
      <Banner gradient="from-emerald-600 to-teal-600" title={`${items.length} ${title}`} />
      <div className="card space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="font-bold">{it.title}</div>
            {it.sub && <div className="text-xs opacity-70">{it.sub}</div>}
            {it.url && <a className="text-xs font-bold text-brand-600 hover:underline" href={it.url} target="_blank" rel="noreferrer">Open ↗</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericJson({ title, data }: { title: string; data: any }) {
  const items: { title: string; sub?: string; url?: string }[] = [];
  if (data?.answer) items.push({ title: 'Answer', sub: String(data.answer).slice(0, 600) });
  if (data?.citations) for (const c0 of [].concat(data.citations).slice(0, 10)) {
    const c: any = c0;
    items.push({ title: c.title || c.source || 'Citation', sub: c.authors || c.snippet, url: c.url || c.uri });
  }
  if (items.length) return <SimpleList title={title} items={items} />;
  // Try to render common shapes
  if (Array.isArray(data)) return <SimpleList title={title} items={data.map((x: any) => ({ title: x.name || x.title || JSON.stringify(x).slice(0, 80), sub: x.id || x.description || '' }))} />;
  return (
    <div className="card">
      <div className="mb-2 text-sm font-bold">{title}</div>
      <pre className="max-h-96 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-emerald-200">{JSON.stringify(data, null, 2).slice(20000)}</pre>
    </div>
  );
}
