import { useEffect, useMemo, useState } from 'react';
import { useData } from '../stores/data';
import { EmptyState, PageHeader, Pill } from '../components/ui';
import { allStages, buildCourse, currentStage, periodsFor, saveCourse } from '../services/academic';

/**
 * Courses — simple, focused.
 *
 * By default the page opens on your CURRENT level (e.g. Level 300) and shows
 * just its two semesters. Past / future levels live in a compact dropdown so
 * you can file courses there without the page being flooded by a wall of
 * placeholder pills.
 */
export function Courses() {
  const stages = useData((s) => s.academicStages);
  const courses = useData((s) => s.courses);
  const remove = useData((s) => s.remove);

  const ordered = useMemo(() => allStages(), [stages]);
  const active = useMemo(() => currentStage(), [stages]);
  const [stageId, setStageId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Land on the CURRENT stage the first time we have data, or on stage change.
  useEffect(() => {
    if (!stageId && (active?.id || ordered[0]?.id)) {
      setStageId(active?.id ?? ordered[0]!.id);
    }
    // If the current stage somehow vanished (e.g. a delete), fall back.
    if (stageId && !ordered.some((s) => s.id === stageId)) {
      setStageId(active?.id ?? ordered[0]?.id ?? '');
    }
  }, [ordered, active, stageId]);

  const stage = ordered.find((s) => s.id === stageId) ?? null;
  const periods = stage ? periodsFor(stage.id) : [];
  const stageCourses = courses.filter((c) => c.stageId === stageId);

  async function add() {
    if (!title.trim() || !stageId || busy) return;
    setBusy(true);
    try {
      await saveCourse(buildCourse(stageId, title, periodId || undefined, code || undefined));
      setTitle('');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (!ordered.length) {
    return (
      <div>
        <PageHeader title="📚 Courses" subtitle="Organise courses by academic year and semester." />
        <EmptyState icon="📚" title="No academic stages yet" hint="Set up your journey first — courses attach to a stage." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="📚 Courses"
        subtitle="Courses belong to an academic year and semester, so future learning can be filed against them."
      />

      {/* Compact stage selector — dropdown, not a wall of pills. Defaults to your
          CURRENT level so on first open you see just the one level you're in. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Viewing:</label>
        <select
          className="input !w-auto !py-1.5 text-sm"
          value={stageId}
          onChange={(e) => {
            setStageId(e.target.value);
            setPeriodId('');
          }}
        >
          {ordered.map((s) => {
            const tag =
              s.status === 'current' ? ' (current)' :
              s.status === 'completed' ? ' (completed)' : ' (upcoming)';
            return (
              <option key={s.id} value={s.id}>
                {s.name} · {s.academicYear}{tag}
              </option>
            );
          })}
        </select>
        <button
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          onClick={() => {
            if (active) {
              setStageId(active.id);
              setPeriodId('');
            }
          }}
        >
          ← Jump to current
        </button>
      </div>

      {stage && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* Course list, grouped by semester */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {stage.name} · {stage.academicYear}
              </h2>
              {stage.status === 'completed' && <Pill color="green">Archived</Pill>}
              {stage.status === 'current' && <Pill color="amber">Current</Pill>}
              {stage.status === 'upcoming' && <Pill color="slate">Upcoming</Pill>}
              <span className="ml-auto text-xs text-slate-400">
                {stageCourses.length} course{stageCourses.length === 1 ? '' : 's'} · {periods.length} semester{periods.length === 1 ? '' : 's'}
              </span>
            </div>

            {periods.length === 0 ? (
              <EmptyState icon="📅" title="No semesters on this level" hint="This stage has no semesters yet — add one in Journey settings." />
            ) : !stageCourses.length ? (
              <EmptyState icon="📚" title={`No courses for ${stage.name} yet`} hint="Add your first course on the right." />
            ) : (
              <>
                {periods.map((p) => {
                  const list = stageCourses.filter((c) => c.periodId === p.id);
                  const unassigned = stageCourses.filter(
                    (c) => !c.periodId || !periods.some((pp) => pp.id === c.periodId)
                  );
                  return (
                    <div key={p.id}>
                      <div className="label">{p.name}</div>
                      {list.length ? (
                        <div className="space-y-1.5">
                          {list.map((c) => (
                            <CourseRow key={c.id} title={c.title} code={c.code} onDelete={() => remove('course', c.id)} />
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs italic text-slate-400 dark:border-slate-700">
                          No courses in {p.name} yet.
                        </p>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const unassigned = stageCourses.filter(
                    (c) => !c.periodId || !periods.some((p) => p.id === c.periodId)
                  );
                  if (!unassigned.length) return null;
                  return (
                    <div>
                      <div className="label">No semester assigned</div>
                      <div className="space-y-1.5">
                        {unassigned.map((c) => (
                          <CourseRow key={c.id} title={c.title} code={c.code} onDelete={() => remove('course', c.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Add form */}
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">＋ Add a course</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Course title</label>
                <input
                  className="input"
                  placeholder="e.g. Pharmacology"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                />
              </div>
              <div>
                <label className="label">Course code (optional)</label>
                <input className="input" placeholder="e.g. PHAR 301" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div>
                <label className="label">Semester</label>
                <select className="input" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                  <option value="">No semester</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn-primary w-full" onClick={add} disabled={!title.trim() || busy}>
                ＋ Add course to {stage.name}
              </button>
              <p className="text-[11px] text-slate-400">
                Course will be filed under <strong>{stage.name}</strong> ({stage.academicYear})
                {periodId ? ', ' + (periods.find((p) => p.id === periodId)?.name ?? '') : ''}. Switch level using the dropdown above.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CourseRow({ title, code, onDelete }: { title: string; code?: string; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      <span className="text-base">📚</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{title}</div>
        {code && <div className="text-[11px] text-slate-400">{code}</div>}
      </div>
      <button
        className="rounded p-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500 focus-ring dark:hover:bg-red-900/30"
        onClick={onDelete}
        aria-label={`Delete course ${title}`}
        title="Delete course"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
