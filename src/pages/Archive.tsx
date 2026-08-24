import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { EmptyState, PageHeader, Pill } from '../components/ui';
import { allStages, coursesFor, periodsFor } from '../services/academic';
import { WARD_ENTRY_META } from '../services/defaults';
import { countsFor } from '../services/wardRounds';
import type { AcademicStage } from '../types';

/**
 * Academic Archive — every year of the journey, permanently browsable.
 *
 * This is the page that makes the "nothing is ever lost" promise visible:
 * completed stages keep their semesters, courses and every linked record, and
 * stay reachable no matter how many promotions have happened since.
 */
export function Archive() {
  const stages = useData((s) => s.academicStages);
  const wardRounds = useData((s) => s.wardRounds);
  const courses = useData((s) => s.courses);
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);

  const ordered = useMemo(() => [...allStages()].reverse(), [stages]); // newest first

  if (!ordered.length) {
    return (
      <div>
        <PageHeader title="🗂 Academic Archive" subtitle="Every year of your journey, kept for good." />
        <EmptyState
          icon="🗂"
          title="No academic stages yet"
          hint="Your archive fills up as you move through the programme."
          actions={
            <button className="btn-primary" onClick={() => navigate('/journey')}>
              Open PharmD Journey
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="🗂 Academic Archive"
        subtitle="Browse any year you've been through — promotion never removes anything."
      />

      <div className="space-y-3">
        {ordered.map((stage) => {
          const expanded = open === stage.id;
          const periods = periodsFor(stage.id);
          const stageCourses = courses.filter((c) => c.stageId === stage.id);
          const rounds = wardRounds.filter((r) => r.academic?.stageId === stage.id);
          const captures = rounds.reduce((n, r) => n + countsFor(r.id).total, 0);

          return (
            <div key={stage.id} className="card">
              <button
                className="flex w-full flex-wrap items-center gap-3 text-left"
                onClick={() => setOpen(expanded ? null : stage.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{stage.name}</span>
                    <StatusPill stage={stage} />
                  </div>
                  <div className="text-xs text-slate-400">
                    {stage.academicYear}
                    {stage.institution ? ` · ${stage.institution}` : ''}
                    {stage.completedAt ? ` · archived ${new Date(stage.completedAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span title="Courses">📚 {stageCourses.length}</span>
                  <span title="Ward rounds">🏥 {rounds.length}</span>
                  <span title="Captures">✍️ {captures}</span>
                  <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {expanded && (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <div>
                    <div className="label">Semesters</div>
                    <div className="flex flex-wrap gap-1.5">
                      {periods.length ? (
                        periods.map((p) => (
                          <span key={p.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700">
                            {p.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">None recorded.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="label">Courses</div>
                    {stageCourses.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {stageCourses.map((c) => {
                          const p = periods.find((x) => x.id === c.periodId);
                          return (
                            <span
                              key={c.id}
                              className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-200"
                            >
                              📚 {c.title}
                              {p && <span className="ml-1.5 text-[11px] opacity-70">{p.name}</span>}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        No courses recorded.{' '}
                        <button className="text-brand-600 hover:underline" onClick={() => navigate('/courses')}>
                          Add some →
                        </button>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="label">Ward rounds from this year</div>
                    {rounds.length ? (
                      <div className="space-y-1.5">
                        {rounds.map((r) => {
                          const c = countsFor(r.id);
                          return (
                            <button
                              key={r.id}
                              className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:border-brand-400 dark:border-slate-700"
                              onClick={() => navigate(`/ward-rounds?round=${r.id}`)}
                            >
                              <span className="font-medium">🏥 {r.ward}</span>
                              <span className="text-xs text-slate-400">{r.date}</span>
                              <span className="ml-auto flex flex-wrap gap-1">
                                {(Object.keys(WARD_ENTRY_META) as Array<keyof typeof WARD_ENTRY_META>)
                                  .filter((t) => c[t] > 0)
                                  .map((t) => (
                                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-700">
                                      {WARD_ENTRY_META[t].icon} {c[t]}
                                    </span>
                                  ))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        No ward rounds linked to this stage. Rounds recorded from now on are stamped automatically.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        🔒 Archived years are read-only history — they stay here for the whole of your programme and career.
      </p>
    </div>
  );
}

function StatusPill({ stage }: { stage: AcademicStage }) {
  if (stage.status === 'current') return <Pill color="amber">🟢 Current</Pill>;
  if (stage.status === 'completed') return <Pill color="green">✓ Completed</Pill>;
  return <Pill color="slate">🔒 Upcoming</Pill>;
}
