import { useMemo, useState } from 'react';
import { useData } from '../stores/data';
import { EmptyState, PageHeader, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import {
  addStage,
  allStages,
  buildCourse,
  coursesFor,
  currentAcademicYear,
  currentStage,
  deleteStage,
  journeyProgress,
  periodsFor,
  planPromotion,
  promote,
  saveCourse,
  setCurrentPeriod,
  setCurrentStage,
  updateStage,
} from '../services/academic';
import type { AcademicStage } from '../types';
import { useConfirm } from '../components/ui/primitives';

const STATUS_META: Record<AcademicStage['status'], { icon: string; label: string; pill: string }> = {
  completed: { icon: '✓', label: 'Completed', pill: 'green' },
  current: { icon: '🟢', label: 'Current', pill: 'amber' },
  upcoming: { icon: '🔒', label: 'Upcoming', pill: 'slate' },
};

export function Journey() {
  const stages = useData((s) => s.academicStages);
  const periods = useData((s) => s.academicPeriods);
  const courses = useData((s) => s.courses);
  const profile = useData((s) => s.profile);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const ordered = useMemo(() => allStages(), [stages]);
  const current = currentStage();
  const progress = journeyProgress();
  const plan = planPromotion();

  const previous = ordered.filter((s) => s.status === 'completed');
  const upcoming = ordered.filter((s) => s.status === 'upcoming');
  const openStage = viewing ? ordered.find((s) => s.id === viewing) ?? null : null;

  if (!ordered.length) {
    return (
      <div>
        <PageHeader title="🎓 PharmD Journey" subtitle="Your academic path, kept for the whole programme." />
        <EmptyState
          icon="🎓"
          title="No academic stages yet"
          hint="Your journey is created when you set up your profile. Add your current level to get started."
          actions={
            <button className="btn-primary" onClick={() => setManageOpen(true)}>
              ＋ Add academic stage
            </button>
          }
        />
        <ManageModal open={manageOpen} onClose={() => setManageOpen(false)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="🎓 PharmD Journey"
        subtitle="Move forward through your programme — nothing from previous years is ever lost."
        action={
          <button className="btn-secondary" onClick={() => setManageOpen(true)}>
            ⚙ Manage Journey
          </button>
        }
      />

      {/* ---- Current stage ---- */}
      {current && (
        <div className="card mb-5 border-brand-300 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-300">
                Current
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{current.name}</h2>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {current.academicYear}
                {current.institution ? ` · ${current.institution}` : ''}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setViewing(current.id)}>
                View Current Year
              </button>
              <button className="btn-primary" onClick={() => setPromoteOpen(true)}>
                Move to {plan.createsNewStage ? `Level ${plan.nextLevel}` : plan.to?.name}
              </button>
            </div>
          </div>

          {/* Semester picker */}
          <div className="mt-4">
            <div className="label">Current semester</div>
            <div className="flex flex-wrap gap-1.5">
              {periodsFor(current.id).map((p) => (
                <button
                  key={p.id}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    profile?.currentPeriodId === p.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  onClick={() => setCurrentPeriod(p.id)}
                >
                  {p.name}
                </button>
              ))}
              {!periodsFor(current.id).length && <span className="text-sm text-slate-400">No semesters defined.</span>}
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Journey progress</span>
              <span>
                {progress.completed} of {progress.total} stages completed
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ---- Timeline ---- */}
      <div className="card mb-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Academic timeline
        </h2>
        <ol className="relative space-y-1 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
          {ordered.map((s) => {
            const meta = STATUS_META[s.status];
            const clickable = s.status !== 'upcoming';
            return (
              <li key={s.id} className="relative py-2.5">
                <span
                  className={`absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full text-[10px] ring-4 ring-white dark:ring-slate-800 ${
                    s.status === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : s.status === 'current'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-300 text-slate-600 dark:bg-slate-600'
                  }`}
                >
                  {s.status === 'completed' ? '✓' : s.status === 'current' ? '●' : '🔒'}
                </span>
                <button
                  className={`flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    clickable ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'cursor-default'
                  }`}
                  onClick={() => clickable && setViewing(s.id)}
                >
                  <span className="text-xs font-semibold text-slate-400">{s.academicYear}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                  <Pill color={meta.pill}>{meta.label}</Pill>
                  {clickable && <span className="ml-auto text-xs text-slate-400">View →</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ---- Previous / Upcoming ---- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Previous years · Academic archive
          </h2>
          {!previous.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
              No completed stages yet.
            </div>
          ) : (
            <div className="space-y-2">
              {previous.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.academicYear}</div>
                  </div>
                  <Pill color="green">Completed</Pill>
                  <button className="btn-secondary !py-1 text-xs" onClick={() => setViewing(s.id)}>
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            🔒 Archived stages stay permanently accessible — promotion never deletes anything.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Upcoming</h2>
          {!upcoming.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
              No upcoming stages — add one from Manage Journey.
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 opacity-75 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.academicYear}</div>
                  </div>
                  <Pill color="slate">🔒 Upcoming</Pill>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PromoteModal open={promoteOpen} onClose={() => setPromoteOpen(false)} />
      <ManageModal open={manageOpen} onClose={() => setManageOpen(false)} />
      <StageDetail stage={openStage} onClose={() => setViewing(null)} />
    </div>
  );
}

// ---------------- Promotion ----------------

function PromoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const plan = planPromotion();
  const targetName = plan.to?.name ?? `Level ${plan.nextLevel}`;

  async function go() {
    setBusy(true);
    try {
      const res = await promote();
      if (res.ok) setDone(`${res.from?.name} archived · ${res.to?.name} is now current`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setDone(null);
        onClose();
      }}
      title="🎓 Move to the next academic stage"
    >
      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-950">
            <div className="text-2xl">🎉</div>
            <p className="mt-1 font-semibold text-emerald-800 dark:text-emerald-200">{done}</p>
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={() => {
                setDone(null);
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            You are about to move from <strong>{plan.from?.name ?? 'your current stage'}</strong> to{' '}
            <strong>{targetName}</strong>. Your previous academic records will remain safely accessible.
          </p>

          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400">{plan.from?.name}</span>
              <Pill color="green">becomes Completed</Pill>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400">{targetName}</span>
              <Pill color="amber">becomes Current</Pill>
            </div>
          </div>

          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            🔒 Nothing is deleted or reset. Every note, ward round and bundle from {plan.from?.name ?? 'this stage'} stays
            exactly where it is and remains viewable under Previous Years.
          </p>

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={go} disabled={busy}>
              {busy ? 'Moving…' : `Move to ${targetName}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------- Manage journey ----------------

function ManageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { confirm, confirmDialog } = useConfirm();
  const stages = useData((s) => s.academicStages);
  const ordered = useMemo(() => allStages(), [stages]);
  const [level, setLevel] = useState('');
  const [year, setYear] = useState(currentAcademicYear());
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!level.trim() || busy) return;
    setBusy(true);
    try {
      await addStage({ level: level.trim(), academicYear: year.trim() || currentAcademicYear(), status: 'upcoming' });
      setLevel('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="⚙ Manage Journey" wide>
      {confirmDialog}
      <div className="space-y-4">
        <div>
          <div className="label">Academic stages</div>
          <div className="space-y-2">
            {ordered.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <input
                    className="input mt-1 !py-1 text-xs"
                    defaultValue={s.academicYear}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.academicYear) updateStage(s, { academicYear: v });
                    }}
                    aria-label={`${s.name} academic year`}
                  />
                </div>
                <select
                  className="input !w-auto !py-1 text-xs"
                  value={s.status}
                  onChange={(e) => {
                    const v = e.target.value as AcademicStage['status'];
                    if (v === 'current') setCurrentStage(s.id);
                    else updateStage(s, { status: v });
                  }}
                >
                  <option value="completed">Completed</option>
                  <option value="current">Current</option>
                  <option value="upcoming">Upcoming</option>
                </select>
                <button
                  className="btn-ghost !px-2 !py-1 text-xs text-red-600"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Remove ${s.name}?`,
                      message: 'This level will no longer appear in your journey timeline.',
                      note: 'Records already stamped with this level are NOT deleted — their academic history is permanent.',
                      confirmLabel: 'Remove level',
                      destructive: true,
                    });
                    if (!ok) return;
                    await deleteStage(s.id);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <div className="label">Add a stage</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="input !w-28"
              placeholder="Level (e.g. 500)"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
            <input className="input !w-36" placeholder="2029/2030" value={year} onChange={(e) => setYear(e.target.value)} />
            <button className="btn-primary" onClick={add} disabled={!level.trim() || busy}>
              ＋ Add
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Stages are data — you can add professional stages (internship, residency) the same way.
          </p>
        </div>

        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Stage detail (archive view) ----------------

function StageDetail({ stage, onClose }: { stage: AcademicStage | null; onClose: () => void }) {
  const courses = useData((s) => s.courses);
  const wardRounds = useData((s) => s.wardRounds);
  const [title, setTitle] = useState('');
  const [periodId, setPeriodId] = useState<string>('');

  if (!stage) return null;
  const periods = periodsFor(stage.id);
  const stageCourses = courses.filter((c) => c.stageId === stage.id);
  // Records already stamped with this stage (Phase 1: ward rounds only).
  const linked = wardRounds.filter((r) => r.academic?.stageId === stage.id);

  async function addCourse() {
    if (!title.trim()) return;
    await saveCourse(buildCourse(stage!.id, title, periodId || undefined));
    setTitle('');
  }

  return (
    <Modal open={!!stage} onClose={onClose} title={`${stage.name} · ${stage.academicYear}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill color={STATUS_META[stage.status].pill}>{STATUS_META[stage.status].label}</Pill>
          {stage.institution && <span className="text-xs text-slate-400">{stage.institution}</span>}
          {stage.completedAt && (
            <span className="text-xs text-slate-400">Archived {new Date(stage.completedAt).toLocaleDateString()}</span>
          )}
        </div>

        {/* Semesters */}
        <div>
          <div className="label">Semesters</div>
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => (
              <span key={p.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700">
                {p.name}
              </span>
            ))}
            {!periods.length && <span className="text-sm text-slate-400">None defined.</span>}
          </div>
        </div>

        {/* Courses */}
        <div>
          <div className="label">Courses</div>
          {!stageCourses.length ? (
            <p className="mb-2 text-sm text-slate-400">No courses recorded for this stage yet.</p>
          ) : (
            <div className="mb-2 space-y-1">
              {stageCourses.map((c) => {
                const p = periods.find((x) => x.id === c.periodId);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700"
                  >
                    <span>
                      📚 {c.title}
                      {p && <span className="ml-2 text-xs text-slate-400">{p.name}</span>}
                    </span>
                    <button
                      className="text-xs text-red-500"
                      onClick={() => useData.getState().remove('course', c.id)}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              className="input flex-1 !py-1.5 text-sm"
              placeholder="Course title (e.g. Pharmacology)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCourse()}
            />
            <select className="input !w-auto !py-1.5 text-sm" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">No semester</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn-primary !py-1.5 text-sm" onClick={addCourse} disabled={!title.trim()}>
              ＋ Add
            </button>
          </div>
        </div>

        {/* Linked records */}
        <div>
          <div className="label">Linked records</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            🏥 {linked.length} ward round{linked.length === 1 ? '' : 's'} recorded during this stage.
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Clinical notes, bundles, questions and achievements will attach to academic stages in later phases — the
            links are already stored.
          </p>
        </div>

        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
