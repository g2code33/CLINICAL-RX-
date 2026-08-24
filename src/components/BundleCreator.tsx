import { useMemo, useState } from 'react';
import { useData } from '../stores/data';
import { allStages, periodsFor } from '../services/academic';
import { allTags } from '../services/learning';
import { todayIso } from '../services/defaults';
import { weekBounds } from '../services/wardRounds';
import {
  BUNDLE_SOURCE_KEYS,
  MODULE_LABELS,
  createCustomBundle,
  createDayBundle,
  createWeekBundle,
  previewBundle,
  type BundleSelection,
} from '../services/bundleEngine';

type Mode = 'day' | 'week' | 'custom';

/**
 * ＋ Create Bundle — Day / Week / Custom, always with a preview first.
 *
 * The preview is what stops accidental bundles: the user sees exactly which
 * records will be frozen into the snapshot before anything is created.
 */
export function BundleCreator({ onDone }: { onDone?: () => void }) {
  const stages = useData((s) => s.academicStages);
  const courses = useData((s) => s.courses);
  // Subscribe so the preview recomputes as records change.
  useData((s) => s.wardRounds);
  useData((s) => s.lessons);

  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [modules, setModules] = useState<string[]>([...BUNDLE_SOURCE_KEYS]);
  const [stageId, setStageId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [tag, setTag] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const orderedStages = useMemo(() => allStages(), [stages]);
  const tags = useMemo(() => allTags().slice(0, 20), [stages]);
  const stageCourses = stageId ? courses.filter((c) => c.stageId === stageId) : courses;

  const selection: BundleSelection = useMemo(() => {
    if (mode === 'day') return { from: date, to: date };
    if (mode === 'week') {
      const w = weekBounds(date);
      return { from: w.start, to: w.end };
    }
    return {
      from,
      to,
      modules: modules.length === BUNDLE_SOURCE_KEYS.length ? undefined : modules,
      stageId: stageId || undefined,
      courseId: courseId || undefined,
      tag: tag || undefined,
    };
  }, [mode, date, from, to, modules, stageId, courseId, tag]);

  const preview = useMemo(() => (showPreview ? previewBundle(selection) : null), [showPreview, selection]);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'day') await createDayBundle(date, title);
      else if (mode === 'week') await createWeekBundle(date, title);
      else await createCustomBundle(selection, title || `Custom Bundle — ${from} → ${to}`, notes);
      useData.getState().setStatus('📦 Bundle created');
      reset();
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMode(null);
    setTitle('');
    setNotes('');
    setShowPreview(false);
  }

  if (!mode) {
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">What kind of bundle?</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ['day', '📅', 'Day', 'Everything from one date'],
            ['week', '🗓', 'Week', 'A full Monday–Sunday week'],
            ['custom', '🎛', 'Custom', 'Date range, modules, level, course, tag'],
          ] as const).map(([m, icon, label, hint]) => (
            <button
              key={m}
              className="rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-700"
              onClick={() => {
                setMode(m);
                setShowPreview(false);
              }}
            >
              <div className="text-xl">{icon}</div>
              <div className="mt-1 font-bold text-slate-800 dark:text-slate-100">{label}</div>
              <div className="text-[11px] text-slate-400">{hint}</div>
            </button>
          ))}
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          A bundle is a <strong>snapshot</strong>. It freezes what your records said at the moment you create it — editing a note
          later never changes an existing bundle.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">{mode} bundle</div>
        <button className="btn-ghost !py-1 text-xs" onClick={reset}>
          ← Change type
        </button>
      </div>

      <div>
        <label className="label">Title</label>
        <input
          className="input"
          placeholder={mode === 'custom' ? 'e.g. Cardiovascular Revision' : 'Leave blank for an automatic title'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {mode !== 'custom' ? (
        <div>
          <label className="label">{mode === 'day' ? 'Date' : 'Any date in the week'}</label>
          <input type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setShowPreview(false); }} />
          {mode === 'week' && (
            <p className="mt-1 text-[11px] text-slate-400">
              Week: {weekBounds(date).start} → {weekBounds(date).end}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setShowPreview(false); }} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setShowPreview(false); }} />
            </div>
          </div>

          <div>
            <label className="label">Modules</label>
            <div className="flex flex-wrap gap-1.5">
              {BUNDLE_SOURCE_KEYS.map((k) => {
                const on = modules.includes(k);
                return (
                  <button
                    key={k}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                    onClick={() => {
                      setModules((m) => (on ? m.filter((x) => x !== k) : [...m, k]));
                      setShowPreview(false);
                    }}
                  >
                    {on ? '☑' : '☐'} {MODULE_LABELS[k] ?? k}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Academic level</label>
              <select
                className="input"
                value={stageId}
                onChange={(e) => { setStageId(e.target.value); setCourseId(''); setShowPreview(false); }}
              >
                <option value="">Any</option>
                {orderedStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.academicYear}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Course</label>
              <select className="input" value={courseId} onChange={(e) => { setCourseId(e.target.value); setShowPreview(false); }}>
                <option value="">Any</option>
                {stageCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tag</label>
              <select className="input" value={tag} onChange={(e) => { setTag(e.target.value); setShowPreview(false); }}>
                <option value="">Any</option>
                {tags.map((t) => (
                  <option key={t.tag} value={t.tag}>
                    #{t.tag} ({t.count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input min-h-[60px] resize-y text-sm"
              placeholder="e.g. My focus this week should be cardiovascular pharmacotherapy."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </>
      )}

      {/* ---- Preview ---- */}
      {preview && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-800 dark:bg-brand-950/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">Bundle preview</span>
            <span className="text-sm font-extrabold text-brand-700 dark:text-brand-300">{preview.total} records</span>
          </div>
          {preview.total === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nothing matches this selection. Adjust the dates or filters — creating an empty bundle is allowed but probably not
              what you want.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {Object.entries(preview.counts).map(([label, n]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{label}</span>
                  <span className="font-bold">{n}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Period: {preview.from} → {preview.to}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {!showPreview ? (
          <button className="btn-secondary" onClick={() => setShowPreview(true)}>
            👁 Preview
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => setShowPreview(false)}>
            ← Back
          </button>
        )}
        <button className="btn-primary" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : '📦 Create Bundle'}
        </button>
      </div>
    </div>
  );
}
