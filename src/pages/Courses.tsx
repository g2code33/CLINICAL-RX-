import { useMemo, useState } from 'react';
import { useData } from '../stores/data';
import { EmptyState, PageHeader, Pill } from '../components/ui';
import { allStages, buildCourse, currentStage, periodsFor, saveCourse } from '../services/academic';

/**
 * Courses — the Phase 1 foundation.
 *
 * A course belongs to an academic stage and (optionally) a semester, which is
 * what will later let clinical learning and AI understand the academic context
 * of a note ("this was during Level 200, Semester 1, Pharmacology").
 *
 * Deliberately simple: add, rename, move between semesters, delete. Grades,
 * credits, timetables and course-linked learning come in later phases.
 */
export function Courses() {
  const stages = useData((s) => s.academicStages);
  const courses = useData((s) => s.courses);
  const periodsAll = useData((s) => s.academicPeriods);
  const remove = useData((s) => s.remove);

  const ordered = useMemo(() => allStages(), [stages]);
  const active = currentStage();
  const [stageId, setStageId] = useState<string>(active?.id ?? ordered[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const stage = ordered.find((s) => s.id === stageId) ?? null;
  const periods = stage ? periodsFor(stage.id) : [];
  const stageCourses = courses.filter((c) => c.stageId === stageId);
  void periodsAll;

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

      {/* Stage selector */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {ordered.map((s) => (
          <button
            key={s.id}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              s.id === stageId
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
            }`}
            onClick={() => {
              setStageId(s.id);
              setPeriodId('');
            }}
          >
            {s.name}
            {s.status === 'current' && <span className="ml-1.5 text-[10px]">🟢</span>}
          </button>
        ))}
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
            </div>

            {!stageCourses.length ? (
              <EmptyState icon="📚" title="No courses for this stage yet" hint="Add your first course on the right." />
            ) : (
              <>
                {periods.map((p) => {
                  const list = stageCourses.filter((c) => c.periodId === p.id);
                  if (!list.length) return null;
                  return (
                    <div key={p.id}>
                      <div className="label">{p.name}</div>
                      <div className="space-y-1.5">
                        {list.map((c) => (
                          <CourseRow key={c.id} title={c.title} code={c.code} onDelete={() => remove('course', c.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const unassigned = stageCourses.filter((c) => !c.periodId || !periods.some((p) => p.id === c.periodId));
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
                <input className="input" placeholder="e.g. PHAR 201" value={code} onChange={(e) => setCode(e.target.value)} />
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
                ＋ Add course
              </button>
              <p className="text-[11px] text-slate-400">
                Adding to <strong>{stage.name}</strong> ({stage.academicYear}). Switch stage above to file a course under a
                different year — including years you've already completed.
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
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <span className="text-base">📚</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{title}</div>
        {code && <div className="text-[11px] text-slate-400">{code}</div>}
      </div>
      <button className="text-xs text-red-500 hover:underline focus-ring" onClick={onDelete} aria-label={`Delete course ${title}`} title="Delete course">
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
