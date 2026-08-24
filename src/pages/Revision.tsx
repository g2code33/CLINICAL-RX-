import { useData } from '../stores/data';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { newRevisionItem } from '../services/defaults';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { isDue, reviewPass, reviewFail, boxLabel, dueInText, countDue, REVISION_BOX_HELP } from '../services/srs';

export function Revision() {
  const revisions = useData((s) => s.revisions);
  const diseases = useData((s) => s.diseases);
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [filter, setFilter] = useState<'due' | 'all'>('due');

  const suggestions = diseases
    .filter((d) => {
      const r = d.revision as any;
      return r && Object.values(r).some((v) => v === false);
    })
    .slice(0, 8);

  const dueCount = countDue(revisions);
  const shown = filter === 'due' ? revisions.filter((r) => isDue(r)) : revisions;
  const sorted = [...shown].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0));

  async function addTopic() {
    if (!topic.trim()) return;
    await save('revision', newRevisionItem(topic.trim()));
    setTopic('');
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Revision Engine"
        subtitle="Spaced repetition — review when due, and it comes back at the right time."
        action={<button className="btn-primary" onClick={() => setOpen(true)}>＋ Add revision topic</button>}
      />

      {suggestions.length > 0 && (
        <div className="card mb-6 border-amber-300 dark:border-amber-700">
          <div className="mb-2 font-semibold text-amber-700 dark:text-amber-400">📚 Suggested from your clinical exposure</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((d) => (
              <button
                key={d.id}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-200"
                onClick={async () => { await save('revision', newRevisionItem(d.name)); }}
              >
                + {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Due summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card !p-3 text-center">
          <div className="text-2xl font-extrabold text-red-500">{dueCount}</div>
          <div className="text-[11px] text-slate-400">Due now</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-extrabold text-brand-600">{revisions.filter((r) => (r.box ?? 0) >= 5).length}</div>
          <div className="text-[11px] text-slate-400">Mastered</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-extrabold">{revisions.length}</div>
          <div className="text-[11px] text-slate-400">Total topics</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-extrabold">{revisions.reduce((n, r) => n + (r.passCount ?? 0), 0)}</div>
          <div className="text-[11px] text-slate-400">Reviews done</div>
        </div>
      </div>

      <p className="mb-2 text-[11px] text-slate-400">{REVISION_BOX_HELP}</p>

      {/* Filter toggles, not tabs: aria-pressed states which filter is on (§27). */}
      <div className="mb-3 flex gap-2" role="group" aria-label="Revision filter">
        <button aria-pressed={filter === 'due'} className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${filter === 'due' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`} onClick={() => setFilter('due')}>
          ⏰ Due now ({dueCount})
        </button>
        <button aria-pressed={filter === 'all'} className={`focus-ring rounded-full px-3 py-1 text-xs font-medium ${filter === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`} onClick={() => setFilter('all')}>
          📚 All topics
        </button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="📚" title={filter === 'due' ? 'Nothing due — great job!' : 'No revision topics yet'} hint={filter === 'due' ? 'Add topics or come back when a review is due.' : 'Add topics manually or click suggestions above.'} />
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const due = isDue(r);
            const box = r.box ?? 0;
            return (
              <div key={r.id} className={`card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${!due ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${box >= 5 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : box >= 3 ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                    {boxLabel(box).replace('Box ', 'B')}
                  </div>
                  <div>
                    <div className={`font-medium ${due ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-300'}`}>{r.topic}</div>
                    <div className="text-xs text-slate-400">
                      {boxLabel(box)} · {due ? '🔴 Due now' : `✓ ${dueInText(r)}`}
                      {r.failCount ? ` · ❌${r.failCount}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {due ? (
                    <>
                      <button className="btn-primary !py-1 text-xs" onClick={async () => { await save('revision', reviewPass(r)); }}>✓ I know it</button>
                      <button className="btn-secondary !py-1 text-xs" onClick={async () => { await save('revision', reviewFail(r)); }}>↺ Again</button>
                    </>
                  ) : (
                    <Pill color={box >= 5 ? 'green' : 'amber'}>{dueInText(r)}</Pill>
                  )}
                  <button className="btn-ghost !p-1 text-xs hover:text-red-500" onClick={() => remove('revision', r.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add revision topic">
        <div className="space-y-3">
          <input autoFocus className="input" placeholder="e.g. Hypertension pharmacotherapy" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTopic()} />
          <button className="btn-primary w-full" onClick={addTopic}>Add ✓</button>
        </div>
      </Modal>
    </div>
  );
}
