import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState } from './ui';
import { useConfirm } from './ui/primitives';
import { Modal, TagInput } from './Modal';
import { explainEntity, runAiModule } from '../services/aiTools';
import type { ModuleType } from '../types';
import { useContextMenu, ctxHandlers, type CtxItem } from './ContextMenu';
import { copyToClipboard } from '../services/export';
import {
  academicLabel,
  addToRevision,
  applyFilter,
  isInRevision,
  logActivity,
  markViewed,
  relatedTo,
  softDelete,
  stampAcademic,
  toggleFavorite,
  type LearningFilter,
} from '../services/learning';
import { LearningFilterBar } from './LearningFilterBar';

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
  explainKind?: 'disease' | 'medicine' | 'investigation';
  emptyActions?: React.ReactNode;
}

export function EntityManager({ module, title, subtitle, icon, emptyText, emptyHint, fields, factory, renderCard, searchKeys, explainKind, emptyActions }: Props) {
  const all = useData((s) => s.all(module));
  const save = useData((s) => s.save);
  const remove = useData((s) => s.remove);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [explain, setExplain] = useState<{ rec: any; text: string; loading: boolean; error?: string } | null>(null);
  const [focusAi, setFocusAi] = useState<{ rec: any; messages: Array<{ role: 'user' | 'ai'; text: string }>; input: string; busy: boolean } | null>(null);
  // Themed confirmation instead of window.confirm (§34).
  const { confirm, confirmDialog } = useConfirm();
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [filter, setFilter] = useState<LearningFilter>({});
  const [formError, setFormError] = useState('');
  const [related, setRelated] = useState<any | null>(null);
  const showMenu = useContextMenu();

  /** Open a focused AI chat on just this card — ask anything about it. */
  function openFocusAi(rec: any) {
    setFocusAi({ rec, messages: [], input: '', busy: false });
  }

  async function sendFocusAi() {
    if (!focusAi || focusAi.busy) return;
    const text = focusAi.input.trim();
    if (!text) return;
    const kind = explainKind || (module === 'medicine' ? 'medicine' : module === 'investigation' ? 'investigation' : module === 'disease' ? 'disease' : 'disease');
    const label = (kind[0].toUpperCase() + kind.slice(1));
    const userMsg = { role: 'user' as const, text };
    setFocusAi({ ...focusAi, messages: [...focusAi.messages, userMsg], input: '', busy: true });
    const prompt = [
      `You are CLINICAL Rx's AI tutor. The student is asking about this specific ${label}: "${focusAi.rec?.name ?? ''}".`,
      `Record details: ${JSON.stringify(focusAi.rec)}`,
      `Student question: ${text}`,
      'Answer thoroughly and at the student\'s level.',
    ].join('\n');
    const res = await runAiModule('tutor', prompt);
    const aiMsg = { role: 'ai' as const, text: res.ok ? res.text : '⚠️ ' + res.error };
    setFocusAi((f) => (f ? { ...f, messages: [...f.messages, aiMsg], busy: false } : f));
  }

  function cardMenu(rec: any): CtxItem[] {
    const items: CtxItem[] = [];
    items.push({ label: 'Edit', icon: '✏️', onClick: () => openEdit(rec) });
    if (explainKind) {
      items.push({
        label: 'AI Explain',
        icon: '🤖',
        onClick: async () => {
          setExplain({ rec, text: '', loading: true });
          const res = await explainEntity(explainKind, rec);
          // Log to the tutor section's chat so it's viewable in AI → Explain.
          import('../services/aiTools').then((m) => m.logAiTask('tutor', `Explain: ${rec?.name ?? ''}`, res.ok ? res.text : '⚠️ ' + res.error)).catch(() => {});
          setExplain((ex) => (ex ? { rec, text: res.ok ? res.text : '', loading: false, error: res.ok ? undefined : res.error } : ex));
        },
      });
    }
    items.push({
      label: 'Copy name',
      icon: '📋',
      onClick: () => { void copyToClipboard(String(rec?.name ?? '')); },
    });
    items.push({
      label: 'Related knowledge',
      icon: '🔗',
      onClick: () => setRelated(rec),
    });
    items.push({
      label: rec.favorite ? 'Remove favourite' : 'Add to favourites',
      icon: rec.favorite ? '★' : '☆',
      onClick: () => void toggleFavorite(module, rec.id),
    });
    items.push({
      label: isInRevision(rec.id) ? 'Already in revision' : 'Mark for revision',
      icon: '📚',
      onClick: () => void addToRevision(module, rec.id),
    });
    items.push({
      label: 'Delete',
      icon: '🗑',
      danger: true,
      onClick: () => {
        const label = String(rec?.name ?? 'this record');
        void (async () => {
          const ok = await confirm({
            title: `Delete "${label}"?`,
            message: 'This removes the record and its direct relationships.',
            note: 'Your unrelated learning notes are NOT deleted.',
            confirmLabel: 'Delete',
            destructive: true,
          });
          if (ok) void softDelete(module, rec.id);
        })();
      },
    });
    return items;
  }

  function openCreate() {
    setCreating(true);
    setEditing(factory());
  }
  function openEdit(rec: any) {
    setEditing({ ...rec });
  }

  async function persist() {
    if (!editing) return;
    const name = String(editing.name ?? editing.title ?? editing.text ?? '').trim();
    if (!name) {
      setFormError('Give this a name before saving.');
      return;
    }
    const now = Date.now();
    // Stamp the academic context on creation; existing records keep theirs so
    // history is never rewritten when the student is promoted.
    const rec = stampAcademic({ ...editing, updatedAt: now, createdAt: editing.createdAt || now });
    await save(module, rec);
    await logActivity(creating ? 'created' : 'updated', module, rec.id, name);
    setFormError('');
    setEditing(null);
    setCreating(false);
  }

  const scoped = applyFilter(all as any[], filter);
  const filtered = query
    ? scoped.filter((r) => (searchKeys ?? ['name']).some((k) => String(r[k] ?? '').toLowerCase().includes(query.toLowerCase())))
    : scoped;

  return (
    <div>
      {confirmDialog}
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={<button className="btn-primary" onClick={openCreate}>＋ Add {title}</button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" placeholder="🔍 Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="ml-auto flex gap-1.5">
          <button
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === 'cards' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
            onClick={() => setView('cards')}
            title="Card view"
          >
            🃏 Cards
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
            onClick={() => setView('list')}
            title="List view"
          >
            📋 List
          </button>
        </div>
      </div>

      <div className="mb-4">
        <LearningFilterBar value={filter} onChange={setFilter} compact />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={icon} title={emptyText} hint={emptyHint} actions={emptyActions} />
      ) : view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((rec) => (
            <div
              key={rec.id}
              className="card flex cursor-pointer flex-col justify-between transition-colors hover:border-brand-400"
              onClick={() => openFocusAi(rec)}
              {...ctxHandlers(showMenu, cardMenu(rec))}
            >
              {renderCard(rec)}
              <div className="mt-3 flex justify-end gap-2">
                {explainKind && (
                  <button
                    className="btn-ghost !py-1 text-xs hover:text-brand-600"
                    onClick={(e) => { e.stopPropagation(); void (async () => {
                      setExplain({ rec, text: '', loading: true });
                      const res = await explainEntity(explainKind as any, rec);
                      import('../services/aiTools').then((m) => m.logAiTask('tutor', `Explain: ${rec?.name ?? ''}`, res.ok ? res.text : '⚠️ ' + res.error)).catch(() => {});
                      setExplain((ex) => (ex ? { rec, text: res.ok ? res.text : '', loading: false, error: res.ok ? undefined : res.error } : ex));
                    })(); }}
                  >
                    🤖 Explain
                  </button>
                )}
                <button className="btn-secondary !py-1 text-xs" onClick={(e) => { e.stopPropagation(); markViewed(module, rec.id, String(rec?.name ?? '')); openEdit(rec); }}>Edit</button>
                <button className="btn-ghost !px-2 !py-1 text-xs" title="Related knowledge" onClick={(e) => { e.stopPropagation(); setRelated(rec); }}>🔗</button>
                <button className="btn-ghost !px-2 !py-1 text-xs" title={rec.favorite ? 'Remove favourite' : 'Add to favourites'} onClick={(e) => { e.stopPropagation(); void toggleFavorite(module, rec.id); }}>{rec.favorite ? '★' : '☆'}</button>
                <button className="btn-ghost !py-1 text-xs hover:text-red-500" onClick={(e) => { e.stopPropagation(); void remove(module, rec.id); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((rec) => (
            <div key={rec.id} className="flex cursor-pointer items-center justify-between gap-3 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => openFocusAi(rec)} {...ctxHandlers(showMenu, cardMenu(rec))}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800 dark:text-slate-100">{rec?.name || rec?.title || 'Untitled'}</div>
                {rec?.what && <div className="truncate text-xs text-slate-400">{rec.what}</div>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {explainKind && (
                  <button className="btn-ghost !p-1 text-xs hover:text-brand-600" onClick={(e) => { e.stopPropagation(); void (async () => {
                    setExplain({ rec, text: '', loading: true });
                    const res = await explainEntity(explainKind as any, rec);
                    import('../services/aiTools').then((m) => m.logAiTask('tutor', `Explain: ${rec?.name ?? ''}`, res.ok ? res.text : '⚠️ ' + res.error)).catch(() => {});
                    setExplain((ex) => (ex ? { rec, text: res.ok ? res.text : '', loading: false, error: res.ok ? undefined : res.error } : ex));
                  })(); }}>🤖</button>
                )}
                <button className="btn-ghost !p-1 text-xs" onClick={(e) => { e.stopPropagation(); openEdit(rec); }}>✏️</button>
                <button className="btn-ghost !p-1 text-xs hover:text-red-500" onClick={(e) => { e.stopPropagation(); void remove(module, rec.id); }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {related && (
        <Modal open onClose={() => setRelated(null)} title={`🔗 Related to ${related.name ?? related.title ?? ''}`} wide>
          <RelatedPanel module={module} id={related.id} />
        </Modal>
      )}

      <Modal open={!!editing} onClose={() => { setEditing(null); setCreating(false); setFormError(''); }} title={creating ? `Add ${title}` : `Edit ${title}`} wide>
        {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{formError}</div>}
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

      <Modal open={!!explain} onClose={() => setExplain(null)} title={`🤖 AI explain · ${explain?.rec?.name ?? title}`} wide>
        {explain?.loading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /> AI Clinical Tutor is thinking…
          </div>
        ) : explain?.error ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-200">⚠️ {explain.error}</div>
        ) : (
          <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-700 dark:text-slate-200">{explain?.text}</div>
        )}
      </Modal>

      {/* Focused AI chat — opened by clicking a card */}
      <Modal open={!!focusAi} onClose={() => setFocusAi(null)} title={`🤖 Ask AI about ${focusAi?.rec?.name ?? ''}`} wide>
        {focusAi && (
          <div className="flex h-[60vh] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-1">
              {focusAi.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
                  <div className="text-3xl">🧠</div>
                  <p>Ask anything about <strong>{focusAi.rec?.name}</strong> — it knows this record.</p>
                  <p className="max-w-sm text-xs">Try: "Explain the mechanism", "What are the key nursing points?", "How would I counsel a patient on this?"</p>
                </div>
              ) : (
                focusAi.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              {focusAi.busy && <div className="text-sm text-slate-400 animate-pulse">🤖 AI Tutor is thinking…</div>}
            </div>
            <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <input
                className="input flex-1"
                placeholder="Ask about this…"
                value={focusAi.input}
                onChange={(e) => setFocusAi({ ...focusAi, input: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void sendFocusAi()}
                disabled={focusAi.busy}
              />
              <button className="btn-primary" onClick={() => void sendFocusAi()} disabled={focusAi.busy || !focusAi.input.trim()}>
                {focusAi.busy ? '…' : '➤'}
              </button>
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
            // Robust: value may be an array of strings, OR an object of
            // {key: boolean} (e.g. Disease.revision). Normalize to a Set.
            const arr = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value).filter((k) => value[k]) : [];
            const checked = arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const nextArr = checked ? arr.filter((x: string) => x !== o) : [...arr, o];
                  // If the original was an object, save back as an object map.
                  if (value && typeof value === 'object' && !Array.isArray(value)) {
                    const obj: Record<string, boolean> = {};
                    for (const k of field.options ?? []) obj[k] = nextArr.includes(k);
                    onChange(obj);
                  } else {
                    onChange(nextArr);
                  }
                }}
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


/**
 * Related knowledge for a record — the relationship hub.
 * Links are resolved from the existing name-based fields AND explicit ids, so
 * they work for records created long before relationships existed.
 */
export function RelatedPanel({ module, id }: { module: ModuleType; id: string }) {
  const rel = relatedTo(module, id);
  const groups: Array<[string, string, any[]]> = [
    ['💊', 'Related medicines', rel.medicines],
    ['🦠', 'Related diseases', rel.diseases],
    ['🧪', 'Related investigations', rel.investigations],
    ['💡', 'Related learning', rel.lessons],
    ['❓', 'Related questions', rel.questions],
  ];
  const total = groups.reduce((n, g) => n + g[2].length, 0);

  if (!total) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nothing linked yet. Relationships build automatically as you record medicines, conditions and investigations that
        mention each other — or link them explicitly when adding a question.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([icon, label, list]) =>
        list.length ? (
          <div key={label}>
            <div className="label">
              {icon} {label} ({list.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((r: any) => (
                <span
                  key={r.id}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  title={academicLabel(r)}
                >
                  {r.name ?? r.title ?? r.text}
                </span>
              ))}
            </div>
          </div>
        ) : null
      )}
      <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-400 dark:border-slate-700">
        These connections are what future AI, ward rounds and bundlers will use to reason across your knowledge.
      </p>
    </div>
  );
}
