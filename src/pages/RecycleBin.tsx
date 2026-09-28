import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, EmptyState } from '../components/ui';
import { useData } from '../stores/data';
import type { TrashItem } from '../stores/data';
import type { ModuleType } from '../types';
import { useConfirm } from '../components/ui/primitives';

const MODULE_META: Record<string, { icon: string; label: string; colour: string }> = {
  day:               { icon: '📅', label: 'Clinical Day',       colour: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  disease:           { icon: '🦠', label: 'Disease',            colour: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
  medicine:          { icon: '💊', label: 'Medicine',           colour: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  investigation:     { icon: '🧪', label: 'Investigation',      colour: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200' },
  question:          { icon: '❓', label: 'Question',           colour: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  lesson:            { icon: '💡', label: 'Lesson / Note',      colour: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' },
  revision:          { icon: '🔁', label: 'Revision',           colour: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200' },
  bundle:            { icon: '📦', label: 'Bundle',             colour: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200' },
  chat:              { icon: '💬', label: 'AI Chat',            colour: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200' },
  quiz:              { icon: '🧠', label: 'Quiz Result',        colour: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200' },
  reminder:          { icon: '⏰', label: 'Reminder',           colour: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  wardRound:         { icon: '🏥', label: 'Ward Round',         colour: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' },
  wardEntry:         { icon: '📝', label: 'Ward Entry',         colour: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' },
  wardAnalysis:      { icon: '🤖', label: 'Ward Analysis',      colour: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300' },
  clinicalExperience:{ icon: '🩺', label: 'Rotation/Placement', colour: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  skill:             { icon: '🧠', label: 'Skill',              colour: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200' },
  achievement:       { icon: '🏆', label: 'Achievement',        colour: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' },
  certification:     { icon: '📜', label: 'Certification',      colour: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200' },
  project:           { icon: '💻', label: 'Project',            colour: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200' },
  research:          { icon: '🔬', label: 'Research',           colour: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200' },
  leadership:        { icon: '👔', label: 'Leadership',         colour: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  goal:              { icon: '🎯', label: 'Goal',               colour: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  course:            { icon: '📚', label: 'Course',             colour: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  activity:          { icon: '📈', label: 'Activity',           colour: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  academicStage:     { icon: '🎓', label: 'Academic Stage',     colour: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200' },
  academicPeriod:    { icon: '📆', label: 'Academic Period',    colour: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
};

function metaFor(m: ModuleType) {
  return MODULE_META[m] || { icon: '🗑', label: m, colour: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function RecycleBin() {
  const navigate = useNavigate();
  const trash = useData((s) => s.removed);
  const restore = useData((s) => s.restoreFromTrash);
  const purge = useData((s) => s.purgeFromTrash);
  const empty = useData((s) => s.emptyTrash);
  const { confirm, confirmDialog } = useConfirm();

  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const moduleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of trash) c[t.module] = (c[t.module] || 0) + 1;
    return c;
  }, [trash]);

  const modulesPresent = useMemo(
    () => Object.keys(moduleCounts).sort((a, b) => moduleCounts[b] - moduleCounts[a]),
    [moduleCounts]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trash
      .filter((t) => filter === 'all' || t.module === filter)
      .filter((t) => !q || t.label.toLowerCase().includes(q));
  }, [trash, filter, search]);

  async function onRestore(t: TrashItem) {
    setBusyId(t.trashId);
    await restore(t.trashId);
    setBusyId(null);
  }

  async function onPurge(t: TrashItem) {
    const ok = await confirm({
      title: 'Delete permanently?',
      message: `"${t.label}" will be gone for good — you won't be able to get it back.`,
      confirmLabel: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(t.trashId);
    await purge(t.trashId);
    setBusyId(null);
  }

  async function onEmpty() {
    const ok = await confirm({
      title: 'Empty the recycle bin?',
      message: `This will permanently delete ${trash.length} item${trash.length === 1 ? '' : 's'}. This can't be undone.`,
      confirmLabel: 'Empty bin',
      destructive: true,
    });
    if (!ok) return;
    await empty();
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmDialog}

      <PageHeader
        title="♻️ Recycle Bin"
        subtitle="Deleted items stay here until you restore or permanently remove them."
        action={
          trash.length > 0 ? (
            <button
              onClick={onEmpty}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-95"
            >
              🗑 Empty bin
            </button>
          ) : null
        }
      />

      {/* Search + filter chips — scrollable on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input sm:max-w-xs"
          placeholder="Search deleted items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === 'all' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            All ({trash.length})
          </button>
          {modulesPresent.map((m) => {
            const mm = metaFor(m as ModuleType);
            return (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === m ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {mm.icon} {mm.label} ({moduleCounts[m]})
              </button>
            );
          })}
        </div>
      </div>

      {trash.length === 0 ? (
        <EmptyState
          icon="♻️"
          title="Recycle bin is empty"
          hint="Anything you delete will show up here so you can restore it if you change your mind."
          actions={
            <button className="btn-secondary" onClick={() => navigate(-1)}>← Go back</button>
          }
        />
      ) : visible.length === 0 ? (
        <div className="card text-center text-sm text-slate-500 dark:text-slate-400">No items match your filter.</div>
      ) : (
        <ul className="grid gap-2 sm:gap-3">
          {visible.map((t) => {
            const mm = metaFor(t.module);
            return (
              <li
                key={t.trashId}
                className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${mm.colour}`}>
                  {mm.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mm.colour}`}>
                      {mm.label}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      deleted {timeAgo(t.deletedAt)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t.label}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    id: {t.record.id?.slice(0, 10)}…
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => onRestore(t)}
                    disabled={busyId === t.trashId}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-60 sm:flex-none"
                  >
                    ↩ Restore
                  </button>
                  <button
                    onClick={() => onPurge(t)}
                    disabled={busyId === t.trashId}
                    className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 active:scale-95 disabled:opacity-60 dark:border-red-900 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-950 sm:flex-none"
                  >
                    🗑 Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
