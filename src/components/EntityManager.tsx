import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState } from './ui';
import { Modal, TagInput } from './Modal';
import type { ModuleType } from '../types';

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'tags' | 'select' | 'number' | 'checkboxes';
  options?: string[];
  placeholder?: string;
}

interface Props {
  module: ModuleType;
  title: string;
  subtitle?: string;
  icon: string;
  emptyText: string;
  emptyHint?: string;
  fields: FieldConfig[];
  factory: () => Record<string, any>;
  renderCard: (rec: any) => React.ReactNode;
  searchKeys?: string[];
}

export function EntityManager({ module, title, subtitle, icon, emptyText, emptyHint, fields, factory, renderCard, searchKeys }: Props) {
  const all = useData((s) => s.all(module));
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  function openCreate() {
    setCreating(true);
    setEditing(factory());
  }
  function openEdit(rec: any) {
    setEditing({ ...rec });
  }

  async function persist() {
    if (!editing) return;
    const now = Date.now();
    const rec = { ...editing, updatedAt: now, createdAt: editing.createdAt || now };
    await save(module, rec);
    setEditing(null);
    setCreating(false);
  }

  const filtered = query
    ? all.filter((r) => (searchKeys ?? ['name']).some((k) => String(r[k] ?? '').toLowerCase().includes(query.toLowerCase())))
    : all;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={<button className="btn-primary" onClick={openCreate}>＋ Add {title}</button>}
      />
      <input className="input mb-4 max-w-sm" placeholder="🔍 Search…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {filtered.length === 0 ? (
        <EmptyState icon={icon} title={emptyText} hint={emptyHint} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((rec) => (
            <div key={rec.id} className="card flex flex-col justify-between hover:border-brand-400">
              {renderCard(rec)}
              <div className="mt-3 flex justify-end gap-2">
                <button className="btn-secondary !py-1 text-xs" onClick={() => openEdit(rec)}>Edit</button>
                <button className="btn-ghost !py-1 text-xs hover:text-red-500" onClick={() => remove(module, rec.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => { setEditing(null); setCreating(false); }} title={creating ? `Add ${title}` : `Edit ${title}`} wide>
        {editing && (
          <div className="space-y-4">
            {fields.map((f) => (
              <FieldRow key={f.key} field={f} value={editing[f.key]} onChange={(v) => setEditing({ ...editing, [f.key]: v })} />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={persist}>Save ✓</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: FieldConfig; value: any; onChange: (v: any) => void }) {
  const inputCls = 'input';
  if (field.type === 'textarea')
    return (
      <div>
        <label className="label">{field.label}</label>
        <textarea className={inputCls} rows={3} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  if (field.type === 'tags')
    return (
      <div>
        <label className="label">{field.label}</label>
        <TagInput value={value ?? []} onChange={onChange} placeholder={field.placeholder} />
      </div>
    );
  if (field.type === 'select')
    return (
      <div>
        <label className="label">{field.label}</label>
        <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  if (field.type === 'number')
    return (
      <div>
        <label className="label">{field.label}</label>
        <input type="number" className={inputCls} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    );
  if (field.type === 'checkboxes')
    return (
      <div>
        <label className="label">{field.label}</label>
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => {
            const checked = (value ?? []).includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(checked ? (value ?? []).filter((x: string) => x !== o) : [...(value ?? []), o])}
                className={`rounded-full px-3 py-1 text-xs font-medium ${checked ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    );
  return (
    <div>
      <label className="label">{field.label}</label>
      <input className={inputCls} value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
