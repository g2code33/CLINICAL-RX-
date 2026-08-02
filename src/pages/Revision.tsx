import { useData } from '../stores/data';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { newRevisionItem } from '../services/defaults';
import { useState } from 'react';
import { Modal } from '../components/Modal';

export function Revision() {
  const revisions = useData((s) => s.revisions);
  const diseases = useData((s) => s.diseases);
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');

  // Auto-suggest topics from conditions with incomplete revision coverage.
  const suggestions = diseases
    .filter((d) => {
      const r = d.revision as any;
      return r && Object.values(r).some((v) => v === false);
    })
    .slice(0, 8);

  async function addTopic() {
    if (!topic.trim()) return;
    await save('revision', newRevisionItem(topic.trim()));
    setTopic('');
    setOpen(false);
  }

  async function toggleReviewed(item: any) {
    await save('revision', { ...item, due: !item.due, reviewedAt: Date.now() });
  }

  return (
    <div>
      <PageHeader
        title="Revision Engine"
        subtitle="Your clinical exposure becomes your study material."
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
                onClick={async () => {
                  await save('revision', newRevisionItem(d.name));
                }}
              >
                + {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {revisions.length === 0 ? (
        <EmptyState icon="📚" title="No revision topics yet" hint="Add topics manually or click suggestions above." />
      ) : (
        <div className="space-y-2">
          {revisions.map((r) => (
            <div key={r.id} className={`card flex items-center justify-between gap-3 ${!r.due ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleReviewed(r)}
                  className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${r.due ? 'border-slate-300' : 'border-brand-500 bg-brand-500 text-white'}`}
                  title={r.due ? 'Mark reviewed' : 'Mark due'}
                >
                  {!r.due && '✓'}
                </button>
                <div>
                  <div className={`font-medium ${r.due ? 'text-slate-800 dark:text-slate-100' : 'line-through text-slate-400'}`}>{r.topic}</div>
                  <div className="text-xs text-slate-400">{r.due ? 'Due for review' : 'Reviewed'} · {new Date(r.updatedAt).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Pill color={r.due ? 'red' : 'green'}>{r.due ? 'Due' : 'Done'}</Pill>
                <button className="btn-ghost !p-1 text-xs hover:text-red-500" onClick={() => remove('revision', r.id)}>Delete</button>
              </div>
            </div>
          ))}
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
