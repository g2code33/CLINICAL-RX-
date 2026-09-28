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
  const profile = useData.getState().profile;
  return {
    stageId: stage?.id,
    periodId: period?.id,
    academicYear: stage?.academicYear ?? profile?.academicYear,
    // Denormalised so archived records can be filtered by level without
    // resolving the stage — which matters once a stage is years in the past,
    // and after a record has travelled to another device via sync.
    level: stage?.level ?? profile?.level,
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
 * Create the initial journey at onboarding: **only the student's current
 * level**, pre-populated with two semesters. Earlier and later levels are
 * created on demand (promotion / "Add level"), not pre-filled — that keeps
 * the Courses page clean on day 1 (one level, two semesters) instead of
 * spamming a wall of placeholder pills for levels the student hasn't
 * reached yet.
 */
export async function bootstrapJourney(input: BootstrapInput): Promise<{ stage: AcademicStage; period: AcademicPeriod | null }> {
  const lvl = String(input.level);
  let year = input.academicYear;
  const stage = buildStage({
    level: lvl,
    academicYear: year,
    status: 'current',
    order: levelNumber(lvl),
    programme: input.programme,
    institution: input.institution,
  });
  await saveStage(stage);

  const periods: AcademicPeriod[] = [];
  for (const [idx, name] of ['Semester 1', 'Semester 2'].entries()) {
    const p = buildPeriod(stage.id, name, idx + 1);
    await savePeriod(p);
    periods.push(p);
  }

  const currentPeriodRec = periods.find((p) => p.name === input.semesterName) ?? periods[0] ?? null;
  return { stage, period: currentPeriodRec };
}

/**
 * Repair duplicate academic stages / periods that accumulated from earlier
 * versions (v1.11.15–v1.11.17 persistence bugs caused multiple bootstrap
 * runs, leaving 50+ duplicate "Level 100/200/..." pills on screen).
 *
 * Safe to run on every launch — returns true if anything was cleaned up.
 *
 * Strategy:
 *   - Group stages by (level, status, academicYear). The first created per
 *     group wins; others are deleted along with their orphaned periods.
 *   - If NO stage is marked `current`, promote the highest-level non-completed
 *     stage (or the latest stage by order) to current.
 *   - Periods are deduped by (stageId, name); courses re-pointed at the
 *     surviving period if both exist.
 */
export async function repairDuplicateJourney(): Promise<number> {
  const st = useData.getState();
  const stages = [...st.academicStages];
  if (!stages.length) return 0;

  // 1) Deduplicate stages by (level, status, academicYear).
  const stageKey = (s: AcademicStage) => `${s.level}|${s.status}|${s.academicYear}`;
  const keepStage = new Map<string, AcademicStage>();
  const dropStageIds = new Set<string>();
  for (const s of [...stages].sort((a, b) => a.createdAt - b.createdAt)) {
    const k = stageKey(s);
    if (keepStage.has(k)) {
      dropStageIds.add(s.id);
    } else {
      keepStage.set(k, s);
    }
  }

  // 2) If duplicates existed for the SAME (level, ANY status, same year),
  //    merge periods from the duplicates into the surviving stage and then
  //    delete the duplicates. For stages at different statuses (e.g. one
  //    "completed" and one "current" Level 300), keep the more advanced
  //    status (current > upcoming > completed) and drop the other.
  const byLevelYear = new Map<string, AcademicStage[]>();
  for (const s of stages) {
    const k = `${s.level}|${s.academicYear}`;
    if (!byLevelYear.has(k)) byLevelYear.set(k, []);
    byLevelYear.get(k)!.push(s);
  }
  const statusRank: Record<StageStatus, number> = { current: 3, upcoming: 2, completed: 1 };
  for (const [, group] of byLevelYear) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => (statusRank[b.status] ?? 0) - (statusRank[a.status] ?? 0) || a.createdAt - b.createdAt);
    const winner = sorted[0];
    for (const loser of sorted.slice(1)) {
      if (loser.id !== winner.id) dropStageIds.add(loser.id);
    }
  }

  // Ensure exactly one "current" stage exists.
  const survivors = stages.filter((s) => !dropStageIds.has(s.id));
  const currentSurvivors = survivors.filter((s) => s.status === 'current');
  if (currentSurvivors.length === 0 && survivors.length) {
    // Pick the latest non-completed stage; fall back to highest order.
    const candidate =
      survivors.find((s) => s.status === 'upcoming') ??
      [...survivors].sort((a, b) => b.order - a.order)[0];
    candidate.status = 'current';
    await saveStage(candidate);
  } else if (currentSurvivors.length > 1) {
    // Multiple "current" — keep the highest order, demote the rest to upcoming.
    const sorted = [...currentSurvivors].sort((a, b) => b.order - a.order);
    for (const extra of sorted.slice(1)) {
      extra.status = 'upcoming';
      await saveStage(extra);
    }
  }

  if (!dropStageIds.size) return 0;

  // 3) Re-point courses/periods that reference dropped stages to the
  //    surviving stage of the same level+year (if one exists); otherwise
  //    move them under the surviving "current" stage so they aren't lost.
  const periods = [...st.academicPeriods];
  const courses = [...st.courses];
  const fallbackStage = survivors.find((s) => s.status === 'current') ?? survivors[0];
  const survivorFor = (loser: AcademicStage): AcademicStage | null => {
    return (
      [...keepStage.values()].find(
        (s) => s.level === loser.level && s.academicYear === loser.academicYear && s.id !== loser.id
      ) ??
      null
    );
  };

  // Build a map of dropped stageId -> surviving stage
  const redirect = new Map<string, AcademicStage>();
  for (const id of dropStageIds) {
    const loser = stages.find((s) => s.id === id);
    if (!loser) continue;
    const winner = survivorFor(loser) ?? fallbackStage;
    if (winner && winner.id !== id) redirect.set(id, winner);
  }

  // Deduplicate periods per (stageId, name) as well.
  const seenPeriods = new Set<string>();
  const dropPeriodIds = new Set<string>();
  for (const p of periods) {
    const newStageId = redirect.get(p.stageId)?.id ?? p.stageId;
    const k = `${newStageId}|${p.name}`;
    if (seenPeriods.has(k)) {
      dropPeriodIds.add(p.id);
    } else {
      seenPeriods.add(k);
      if (newStageId !== p.stageId) {
        await savePeriod({ ...p, stageId: newStageId });
      }
    }
  }

  // Repoint courses that reference dropped stages or dropped periods.
  const survivingPeriodBy = (stageId: string, name: string) =>
    periods.find((pp) => !dropPeriodIds.has(pp.id) && (redirect.get(pp.stageId)?.id ?? pp.stageId) === stageId && pp.name === name);

  for (const c of courses) {
    const origStageId = c.stageId;
    const newStageId = redirect.get(origStageId)?.id ?? origStageId;
    let newPeriodId = c.periodId;
    if (c.periodId) {
      const per = periods.find((pp) => pp.id === c.periodId);
      if (per) {
        const perStageId = redirect.get(per.stageId)?.id ?? per.stageId;
        const target = survivingPeriodBy(newStageId, per.name);
        if (target) newPeriodId = target.id;
        else newPeriodId = undefined;
        // Period was orphaned (no equivalent on survivor) — drop assignment.
        if (perStageId !== newStageId && !target) newPeriodId = undefined;
      } else if (dropPeriodIds.has(c.periodId)) {
        newPeriodId = undefined;
      }
    }
    if (newStageId !== origStageId || newPeriodId !== c.periodId) {
      await useData.getState().save('course', { ...c, stageId: newStageId, periodId: newPeriodId }, { fromSync: true });
    }
  }

  // Actually delete dropped periods/stages.
  for (const id of dropPeriodIds) {
    await useData.getState().remove('academicPeriod', id);
  }
  for (const id of dropStageIds) {
    // deleteStage would also remove the periods/courses under it — but we've
    // already repointed the keepers, so just remove the stage row itself.
    await useData.getState().remove('academicStage', id);
  }

  return dropStageIds.size;
}

/**
 * Repair/backfill: if a profile exists from an older version with no journey,
 * build one from the profile's level so the app is never in a broken state.
 * Safe to call on every launch — it no-ops when stages already exist (after
 * dedup).
 */
export async function ensureJourney(): Promise<boolean> {
  // Always run dedup repair first — cleans up data left by v1.11.15/16/17.
  await repairDuplicateJourney();
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

// ---- Demotion (go back a level) ----------------------------------------

export interface DemotionPlan {
  from: AcademicStage | null;
  /** The completed stage we would return to. Null when there is none. */
  to: AcademicStage | null;
  /** Why the move is not possible, when `to` is null. */
  reason?: string;
}

/**
 * Work out what going back a level would do, without doing it.
 *
 * Only a stage that was actually completed can be returned to — this never
 * invents history. If the student is already at their earliest stage there is
 * nowhere to go back to.
 */
export function planDemotion(): DemotionPlan {
  const stages = allStages();
  const from = currentStage();
  if (!from) return { from: null, to: null, reason: 'No current academic stage.' };

  const idx = stages.findIndex((s) => s.id === from.id);
  if (idx <= 0) {
    return { from, to: null, reason: `${from.name} is your earliest level — there is nothing before it.` };
  }

  // Nearest earlier stage that was completed (walk backwards).
  const previous = [...stages.slice(0, idx)].reverse().find((s) => s.status === 'completed') ?? null;
  if (!previous) {
    return { from, to: null, reason: 'No completed earlier level to return to.' };
  }
  return { from, to: previous };
}

/**
 * Return to a previous academic stage ("decline to Level …").
 *
 * The mirror image of promote(), and just as additive: the level you leave is
 * marked `upcoming` again rather than deleted, so every record created there
 * stays exactly where it is and remains editable. Going back and forward
 * repeatedly must be lossless.
 *
 * Academic-year immutability still holds: no record is ever restamped. A note
 * written at Level 300 keeps its Level 300 stamp even while you are working
 * back at Level 200 — the timeline is a cursor, not a rewrite.
 *
 * @param targetStageId Optional explicit stage to return to. Defaults to the
 *                      nearest completed earlier stage.
 */
export async function demote(
  targetStageId?: string
): Promise<{ ok: boolean; from?: AcademicStage; to?: AcademicStage; error?: string }> {
  const plan = planDemotion();
  if (!plan.from) return { ok: false, error: plan.reason ?? 'No current academic stage.' };

  const target = targetStageId ? getStage(targetStageId) : plan.to;
  if (!target) return { ok: false, error: plan.reason ?? 'No earlier level to return to.' };
  if (target.id === plan.from.id) return { ok: false, error: 'You are already on that level.' };

  // 1) The level being left goes back to `upcoming`. Its records are untouched
  //    and it can be completed again later by promoting forward.
  const reopened: AcademicStage = {
    ...plan.from,
    status: 'upcoming',
    completedAt: undefined,
    endDate: undefined,
  };
  await saveStage(reopened);

  // 2) The earlier stage becomes current again, keeping its original dates.
  const restored: AcademicStage = {
    ...target,
    status: 'current',
    completedAt: undefined,
    endDate: undefined,
  };
  await saveStage(restored);

  // 3) Point the profile back at that stage and its first period.
  const firstPeriod = periodsFor(restored.id)[0] ?? null;
  const profile = useData.getState().profile;
  if (profile) {
    await useData.getState().saveProfile({
      ...profile,
      updatedAt: Date.now(),
      level: restored.level,
      academicYear: restored.academicYear,
      currentStageId: restored.id,
      currentPeriodId: firstPeriod?.id,
    });
  }

  useData
    .getState()
    .setStatus(`↩ Back on ${restored.name} — your ${reopened.name} work is saved and still there`);
  return { ok: true, from: reopened, to: restored };
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
