import { useData, uid } from '../stores/data';
import type { AcademicLink, AcademicPeriod, AcademicStage, Course, StageStatus } from '../types';

/**
 * Academic Journey — the longitudinal spine of CLINICAL Rx.
 *
 * Core principle: **progression is additive**. Advancing from Level 200 to
 * Level 300 archives the old stage (`status: 'completed'`) and never deletes
 * anything. Every past stage — and every record stamped with it — remains
 * permanently accessible.
 *
 * Stages and periods are DATA, not hard-coded enums, so future professional
 * stages (internship, residency, CPD years) need no schema change.
 *
 * Offline-first: every function here writes through the existing storage
 * adapter (SQLite on desktop via IPC, localStorage on web) and never touches
 * the network.
 */

// ---- Helpers -----------------------------------------------------------

function nowIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026/2027" for a date in the 2026-27 academic year (rolls over in August). */
export function currentAcademicYear(date = new Date()): string {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 7 ? y : y - 1; // Aug (7) starts a new year
  return `${startYear}/${startYear + 1}`;
}

/** "2026/2027" -> "2027/2028" */
export function nextAcademicYear(year: string): string {
  const m = /^(\d{4})\s*\/\s*(\d{2,4})$/.exec(year.trim());
  if (!m) return year;
  const start = Number(m[1]) + 1;
  return `${start}/${start + 1}`;
}

/** Numeric level from a stage name/level token, for default ordering. */
function levelNumber(level: string): number {
  const n = Number(String(level).replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---- Reads -------------------------------------------------------------

/** All stages ordered along the timeline (earliest first). */
export function allStages(): AcademicStage[] {
  return [...useData.getState().academicStages].sort(
    (a, b) => a.order - b.order || levelNumber(a.level) - levelNumber(b.level)
  );
}

export function getStage(id: string | undefined | null): AcademicStage | null {
  if (!id) return null;
  return useData.getState().academicStages.find((s) => s.id === id) ?? null;
}

/** The stage marked `current`, falling back to the profile's pointer. */
export function currentStage(): AcademicStage | null {
  const st = useData.getState();
  const flagged = st.academicStages.find((s) => s.status === 'current');
  if (flagged) return flagged;
  return getStage(st.profile?.currentStageId);
}

export function stagesByStatus(status: StageStatus): AcademicStage[] {
  return allStages().filter((s) => s.status === status);
}

/** Periods (semesters) belonging to a stage, in order. */
export function periodsFor(stageId: string): AcademicPeriod[] {
  return useData
    .getState()
    .academicPeriods.filter((p) => p.stageId === stageId)
    .sort((a, b) => a.index - b.index);
}

export function getPeriod(id: string | undefined | null): AcademicPeriod | null {
  if (!id) return null;
  return useData.getState().academicPeriods.find((p) => p.id === id) ?? null;
}

export function currentPeriod(): AcademicPeriod | null {
  return getPeriod(useData.getState().profile?.currentPeriodId);
}

export function coursesFor(stageId: string, periodId?: string): Course[] {
  return useData
    .getState()
    .courses.filter((c) => c.stageId === stageId && (!periodId || c.periodId === periodId))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The academic context to stamp on a new learning record. Future modules
 * (ward rounds, bundles, notes) call this so data can be sliced by stage,
 * semester and year for the rest of the user's journey.
 */
export function currentAcademicLink(): AcademicLink {
  const stage = currentStage();
  const period = currentPeriod();
  return {
    stageId: stage?.id,
    periodId: period?.id,
    academicYear: stage?.academicYear ?? useData.getState().profile?.academicYear,
  };
}

/** Progress along the journey, for the dashboard. */
export function journeyProgress(): { completed: number; total: number; percent: number } {
  const stages = allStages();
  const completed = stages.filter((s) => s.status === 'completed').length;
  const total = stages.length;
  // The current stage counts as half a step so the bar moves during the year.
  const effective = completed + (stages.some((s) => s.status === 'current') ? 0.5 : 0);
  return { completed, total, percent: total ? Math.round((effective / total) * 100) : 0 };
}

// ---- Writes ------------------------------------------------------------

export interface NewStageInput {
  name?: string;
  level: string;
  academicYear: string;
  status?: StageStatus;
  order?: number;
  startDate?: string;
  endDate?: string;
  institution?: string;
  programme?: string;
}

export function buildStage(input: NewStageInput): AcademicStage {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    name: input.name?.trim() || `Level ${input.level}`,
    level: String(input.level),
    academicYear: input.academicYear,
    status: input.status ?? 'upcoming',
    order: input.order ?? levelNumber(input.level),
    startDate: input.startDate,
    endDate: input.endDate,
    institution: input.institution,
    programme: input.programme,
  };
}

export function buildPeriod(stageId: string, name: string, index: number): AcademicPeriod {
  const now = Date.now();
  return { id: uid(), createdAt: now, updatedAt: now, stageId, name, index };
}

export async function saveStage(stage: AcademicStage): Promise<void> {
  await useData.getState().save('academicStage', stage);
}

export async function savePeriod(period: AcademicPeriod): Promise<void> {
  await useData.getState().save('academicPeriod', period);
}

export async function saveCourse(course: Course): Promise<void> {
  await useData.getState().save('course', course);
}

export function buildCourse(stageId: string, title: string, periodId?: string, code?: string): Course {
  const now = Date.now();
  return { id: uid(), createdAt: now, updatedAt: now, stageId, periodId, title: title.trim(), code: code?.trim() };
}

/** Add a stage plus its periods (default: two semesters). */
export async function addStage(input: NewStageInput, periodNames: string[] = ['Semester 1', 'Semester 2']): Promise<AcademicStage> {
  const stage = buildStage(input);
  await saveStage(stage);
  let i = 1;
  for (const name of periodNames) {
    await savePeriod(buildPeriod(stage.id, name, i++));
  }
  return stage;
}

export async function updateStage(stage: AcademicStage, patch: Partial<AcademicStage>): Promise<void> {
  await saveStage({ ...stage, ...patch });
}

/**
 * Delete a stage. Deliberately NOT used by promotion — only exposed for
 * "Manage journey" so a user can remove a stage they created by mistake.
 * Its periods and courses go with it; learning records keep their stamp and
 * simply lose the link.
 */
export async function deleteStage(stageId: string): Promise<void> {
  const st = useData.getState();
  for (const p of st.academicPeriods.filter((p) => p.stageId === stageId)) {
    await st.remove('academicPeriod', p.id);
  }
  for (const c of st.courses.filter((c) => c.stageId === stageId)) {
    await st.remove('course', c.id);
  }
  await st.remove('academicStage', stageId);
}

// ---- Bootstrapping -----------------------------------------------------

export interface BootstrapInput {
  level: string; // current level, e.g. "200"
  academicYear: string; // e.g. "2026/2027"
  programme?: string;
  institution?: string;
  semesterName?: string; // which semester the user is in now
  /** Levels to create in total; defaults to 100..400 plus the current one. */
  levels?: string[];
}

/**
 * Create the initial journey at onboarding: every level from the list, with
 * the user's current level marked `current`, earlier ones `completed` and
 * later ones `upcoming`. Academic years are back- and forward-filled.
 */
export async function bootstrapJourney(input: BootstrapInput): Promise<{ stage: AcademicStage; period: AcademicPeriod | null }> {
  const levels = (input.levels ?? ['100', '200', '300', '400'])
    .map(String)
    .concat(String(input.level))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => levelNumber(a) - levelNumber(b));

  const currentIdx = levels.indexOf(String(input.level));
  let current: AcademicStage | null = null;
  let currentPeriodRec: AcademicPeriod | null = null;

  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];
    // Walk academic years outward from the current stage.
    let year = input.academicYear;
    const delta = i - currentIdx;
    if (delta > 0) for (let k = 0; k < delta; k++) year = nextAcademicYear(year);
    if (delta < 0) {
      const start = Number(input.academicYear.slice(0, 4)) + delta;
      year = `${start}/${start + 1}`;
    }

    const status: StageStatus = i < currentIdx ? 'completed' : i === currentIdx ? 'current' : 'upcoming';
    const stage = buildStage({
      level: lvl,
      academicYear: year,
      status,
      order: levelNumber(lvl),
      programme: input.programme,
      institution: input.institution,
    });
    if (status === 'completed') stage.completedAt = Date.now();
    await saveStage(stage);

    const periods: AcademicPeriod[] = [];
    for (const [idx, name] of ['Semester 1', 'Semester 2'].entries()) {
      const p = buildPeriod(stage.id, name, idx + 1);
      await savePeriod(p);
      periods.push(p);
    }

    if (status === 'current') {
      current = stage;
      currentPeriodRec = periods.find((p) => p.name === input.semesterName) ?? periods[0] ?? null;
    }
  }

  return { stage: current!, period: currentPeriodRec };
}

/**
 * Repair/backfill: if a profile exists from an older version with no journey,
 * build one from the profile's level so the app is never in a broken state.
 * Safe to call on every launch — it no-ops when stages already exist.
 */
export async function ensureJourney(): Promise<boolean> {
  const st = useData.getState();
  if (st.academicStages.length) return false;
  const profile = st.profile;
  if (!profile) return false;
  const { stage, period } = await bootstrapJourney({
    level: profile.level || '200',
    academicYear: profile.academicYear || currentAcademicYear(),
    programme: profile.programme,
    institution: profile.institution,
  });
  await useData.getState().saveProfile({
    ...useData.getState().profile!,
    updatedAt: Date.now(),
    currentStageId: stage.id,
    currentPeriodId: period?.id,
    academicYear: stage.academicYear,
  });
  return true;
}

// ---- Promotion ---------------------------------------------------------

export interface PromotionPlan {
  from: AcademicStage | null;
  to: AcademicStage | null;
  /** True when the target stage has to be created (no `upcoming` stage yet). */
  createsNewStage: boolean;
  nextLevel: string;
  nextYear: string;
}

/** Work out what a promotion would do, without doing it. */
export function planPromotion(): PromotionPlan {
  const stages = allStages();
  const from = currentStage();
  const idx = from ? stages.findIndex((s) => s.id === from.id) : -1;
  const to = idx >= 0 ? stages.slice(idx + 1).find((s) => s.status === 'upcoming') ?? null : null;
  const nextLevel = to?.level ?? String(levelNumber(from?.level ?? '0') + 100);
  const nextYear = to?.academicYear ?? nextAcademicYear(from?.academicYear ?? currentAcademicYear());
  return { from, to, createsNewStage: !to, nextLevel, nextYear };
}

/**
 * Advance to the next academic stage.
 *
 * ADDITIVE BY DESIGN: the outgoing stage is marked `completed` and keeps every
 * record ever linked to it. Nothing is deleted, reset or overwritten.
 */
export async function promote(): Promise<{ ok: boolean; from?: AcademicStage; to?: AcademicStage; error?: string }> {
  const plan = planPromotion();
  if (!plan.from) return { ok: false, error: 'No current academic stage to promote from.' };

  // 1) Archive the outgoing stage — data stays, only its status changes.
  const archived: AcademicStage = {
    ...plan.from,
    status: 'completed',
    completedAt: Date.now(),
    endDate: plan.from.endDate || nowIso(),
  };
  await saveStage(archived);

  // 2) Resolve (or create) the incoming stage.
  let target = plan.to;
  if (!target) {
    target = await addStage({
      level: plan.nextLevel,
      academicYear: plan.nextYear,
      status: 'upcoming',
      programme: plan.from.programme,
      institution: plan.from.institution,
    });
  }
  const promoted: AcademicStage = { ...target, status: 'current', startDate: target.startDate || nowIso() };
  await saveStage(promoted);

  // 3) Point the profile at the new stage and its first period.
  const firstPeriod = periodsFor(promoted.id)[0] ?? null;
  const profile = useData.getState().profile;
  if (profile) {
    await useData.getState().saveProfile({
      ...profile,
      updatedAt: Date.now(),
      level: promoted.level,
      academicYear: promoted.academicYear,
      currentStageId: promoted.id,
      currentPeriodId: firstPeriod?.id,
    });
  }

  useData.getState().setStatus(`🎓 Promoted to ${promoted.name} — ${archived.name} archived and still accessible`);
  return { ok: true, from: archived, to: promoted };
}

/** Switch the active semester within the current stage. */
export async function setCurrentPeriod(periodId: string): Promise<void> {
  const profile = useData.getState().profile;
  if (!profile) return;
  await useData.getState().saveProfile({ ...profile, updatedAt: Date.now(), currentPeriodId: periodId });
}

/**
 * Make an existing stage the current one (e.g. correcting a mistake). The
 * previously-current stage is archived, never deleted.
 */
export async function setCurrentStage(stageId: string): Promise<void> {
  const target = getStage(stageId);
  if (!target) return;
  const previous = currentStage();
  if (previous && previous.id !== stageId) {
    await saveStage({ ...previous, status: 'completed', completedAt: Date.now() });
  }
  await saveStage({ ...target, status: 'current' });
  const firstPeriod = periodsFor(stageId)[0] ?? null;
  const profile = useData.getState().profile;
  if (profile) {
    await useData.getState().saveProfile({
      ...profile,
      updatedAt: Date.now(),
      level: target.level,
      academicYear: target.academicYear,
      currentStageId: target.id,
      currentPeriodId: firstPeriod?.id,
    });
  }
}
