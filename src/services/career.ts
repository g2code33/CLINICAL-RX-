import { useData, uid } from '../stores/data';
import { getStage, allStages, currentAcademicLink } from './academic';
import { todayIso } from './defaults';
import type {
  Achievement,
  AchievementCategory,
  BaseRecord,
  Certification,
  ClinicalExperience,
  CPActionType,
  CPDrugCard,
  CPEncounter,
  CPEncounterType,
  CPFollowUp,
  CPScenario,
  EvidenceRef,
  Goal,
  GoalCategory,
  GoalMilestone,
  GoalStatus,
  LeadershipRole,
  ModuleType,
  Project,
  ProjectStatus,
  ResearchItem,
  ResearchKind,
  Skill,
  SkillCategory,
  StageSnapshot,
  Visibility,
} from '../types';

/**
 * 🎓 PHARMD JOURNEY + PROFESSIONAL CAREER ENGINE (Phase 6)
 *
 * Turns CLINICAL Rx into a long-term professional operating system spanning
 * Level 200 → 300 → 400 → internship → career.
 *
 * Three principles run through every function here:
 *
 *  1. HISTORY IS IMMUTABLE. Records are stamped with the academic stage they
 *     happened in. Progressing to a new level never rewrites, moves or deletes
 *     a single historical record.
 *
 *  2. NOTHING IS CLAIMED FOR THE USER. Confidence ratings, competencies and
 *     achievements are only ever what the student explicitly entered. The app
 *     computes counts from real data and nothing else.
 *
 *  3. PRIVATE BY DEFAULT. Every professional record starts PRIVATE. The
 *     student explicitly promotes records to their portfolio and separately
 *     approves them for export.
 */

// ---- Module registry ---------------------------------------------------

/** The eight professional modules, with their store arrays. */
export const CAREER_MODULES = [
  { module: 'clinicalExperience' as ModuleType, key: 'clinicalExperiences', label: 'Clinical Experience', icon: '🏥' },
  { module: 'skill' as ModuleType, key: 'skills', label: 'Skills', icon: '🧠' },
  { module: 'achievement' as ModuleType, key: 'achievements', label: 'Achievements', icon: '🏆' },
  { module: 'certification' as ModuleType, key: 'certifications', label: 'Certifications', icon: '📜' },
  { module: 'project' as ModuleType, key: 'projects', label: 'Projects', icon: '💻' },
  { module: 'research' as ModuleType, key: 'research', label: 'Research', icon: '🔬' },
  { module: 'leadership' as ModuleType, key: 'leadership', label: 'Leadership', icon: '🏅' },
  { module: 'goal' as ModuleType, key: 'goals', label: 'Goals', icon: '🎯' },
] as const;

export const SKILL_CATEGORIES: Array<{ key: SkillCategory; label: string; icon: string }> = [
  { key: 'clinical', label: 'Clinical', icon: '🩺' },
  { key: 'pharmaceutical', label: 'Pharmaceutical', icon: '💊' },
  { key: 'academic', label: 'Academic', icon: '📚' },
  { key: 'research', label: 'Research', icon: '🔬' },
  { key: 'technology', label: 'Technology', icon: '💻' },
  { key: 'communication', label: 'Communication', icon: '💬' },
  { key: 'leadership', label: 'Leadership', icon: '🏅' },
  { key: 'professional', label: 'Professional', icon: '👔' },
];

export const CONFIDENCE_LABEL: Record<number, string> = {
  1: 'Beginner',
  2: 'Developing',
  3: 'Competent',
  4: 'Strong',
  5: 'Advanced',
};

export const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'planning', 'active', 'completed', 'archived'];
export const GOAL_STATUSES: GoalStatus[] = ['not-started', 'active', 'paused', 'completed', 'archived'];

export const GOAL_CATEGORIES: GoalCategory[] = [
  'academic',
  'clinical',
  'research',
  'technology',
  'career',
  'professional',
  'personal',
];

// ---- Record construction -----------------------------------------------

function base<T extends BaseRecord>(extra: Partial<T> = {}): BaseRecord {
  const now = Date.now();
  return { id: uid(), createdAt: now, updatedAt: now, ...(extra as any) };
}

/**
 * Stamp the CURRENT academic context onto a new record.
 * This is what makes history immutable: the stamp is written once, at
 * creation, and never recalculated afterwards.
 */
function stamp() {
  return currentAcademicLink();
}

export function newClinicalExperience(title: string, startDate = todayIso()): ClinicalExperience {
  return {
    ...base(),
    title,
    startDate,
    academic: stamp(),
    visibility: 'private',
    objectives: [],
    skillsPracticed: [],
    relatedRoundIds: [],
    evidence: [],
  } as ClinicalExperience;
}

export function newSkill(title: string, category: SkillCategory = 'clinical'): Skill {
  return {
    ...base(),
    title,
    category,
    confidence: 1, // always starts at Beginner — never auto-claimed
    academic: stamp(),
    visibility: 'private',
    evidence: [],
  } as Skill;
}

export function newAchievement(title: string, category: AchievementCategory = 'academic'): Achievement {
  return {
    ...base(),
    title,
    category,
    date: todayIso(),
    academic: stamp(),
    visibility: 'private',
    evidence: [],
  } as Achievement;
}

export function newCertification(title: string): Certification {
  return {
    ...base(),
    title,
    dateObtained: todayIso(),
    visibility: 'private',
    evidence: [],
  } as Certification;
}

export function newProject(title: string, status: ProjectStatus = 'idea'): Project {
  return {
    ...base(),
    title,
    status,
    academic: stamp(),
    visibility: 'private',
    skillIds: [],
    technologies: [],
    links: [],
    evidence: [],
  } as Project;
}

export function newResearch(title: string, kind: ResearchKind = 'interest'): ResearchItem {
  return {
    ...base(),
    title,
    kind,
    academic: stamp(),
    visibility: 'private',
    skillIds: [],
    evidence: [],
  } as ResearchItem;
}

export function newLeadership(organization: string, position: string): LeadershipRole {
  return {
    ...base(),
    title: `${position} — ${organization}`,
    organization,
    position,
    startDate: todayIso(),
    academic: stamp(),
    visibility: 'private',
    responsibilities: [],
    achievements: [],
    skillIds: [],
    evidence: [],
  } as LeadershipRole;
}

export function newGoal(title: string, category: GoalCategory = 'academic'): Goal {
  return {
    ...base(),
    title,
    category,
    status: 'not-started',
    startDate: todayIso(),
    academic: stamp(),
    visibility: 'private',
    milestones: [],
    evidence: [],
  } as Goal;
}

export function newMilestone(title: string): GoalMilestone {
  return { id: uid(), title, done: false };
}

// ---- Community Pharmacy workstation -----------------------------------

export const CP_ENCOUNTER_TYPES: { key: CPEncounterType; label: string; icon: string }[] = [
  { key: 'otc-consult', label: 'OTC consult', icon: '🛒' },
  { key: 'prescription', label: 'Prescription dispensing', icon: '💊' },
  { key: 'counselling', label: 'Counselling / MUR', icon: '💬' },
  { key: 'side-effect', label: 'Side effect report', icon: '⚠️' },
  { key: 'interaction', label: 'Interaction query', icon: '🔄' },
  { key: 'referral', label: 'Referral (red flag)', icon: '🚨' },
  { key: 'minor-ailment', label: 'Minor ailment scheme', icon: '🩹' },
  { key: 'other', label: 'Other', icon: '📝' },
];

export const CP_ACTION_TYPES: { key: CPActionType; label: string; tone: string }[] = [
  { key: 'recommend-otc', label: 'Recommended OTC', tone: 'brand' },
  { key: 'dispense-as-written', label: 'Dispensed as written', tone: 'brand' },
  { key: 'counsel-only', label: 'Counselling only', tone: 'indigo' },
  { key: 'lifestyle-advice', label: 'Lifestyle advice', tone: 'teal' },
  { key: 'contact-prescriber', label: 'Contacted prescriber', tone: 'amber' },
  { key: 'refuse-sale', label: 'Refused sale (safety)', tone: 'red' },
  { key: 'refer-to-doctor', label: 'Referred to GP', tone: 'amber' },
  { key: 'refer-emergency', label: 'Referred to A&E', tone: 'red' },
];

export const CP_FOLLOWUPS: { key: CPFollowUp; label: string }[] = [
  { key: 'none', label: 'No follow-up' },
  { key: '24h', label: 'Come back in 24 h' },
  { key: '48h', label: 'Come back in 48 h' },
  { key: '1-week', label: 'Check in 1 week' },
  { key: 'see-gp-if', label: 'See GP if not better' },
];

export function newCPEncounter(title: string, encounterType: CPEncounterType = 'otc-consult'): CPEncounter {
  return {
    ...base(),
    title,
    encounterType,
    date: todayIso(),
    patientPresentation: '',
    patientContext: { comorbidities: [], currentMeds: [], allergies: [] },
    symptoms: [],
    redFlags: [],
    actionTaken: 'recommend-otc',
    counsellingProvided: [],
    warningsGiven: [],
    knowledgeGaps: [],
    drugCardIds: [],
    confidence: 3,
    academic: stamp(),
    visibility: 'private',
  } as CPEncounter;
}

export function newCPDrugCard(genericName: string): CPDrugCard {
  return {
    ...base(),
    title: genericName,
    genericName,
    brandNames: [],
    schedule: 'P',
    indicationsCommunity: [],
    contraindications: [],
    cautions: [],
    commonSideEffects: [],
    interactionsToFlag: [],
    counsellingPoints: [],
    redFlagsRefer: [],
    easilyConfusedWith: [],
    confidence: 2,
    timesUsed: 0,
    academic: stamp(),
    visibility: 'private',
  } as CPDrugCard;
}

export function newCPScenario(scenario: string): CPScenario {
  return {
    ...base(),
    title: scenario.slice(0, 80),
    scenario,
    redFlags: [],
    appropriateActions: [],
    inappropriateActions: [],
    difficulty: 'beginner',
    tags: [],
    completed: false,
    academic: stamp(),
    visibility: 'private',
  } as CPScenario;
}

/** Build a rich pre-seeded prompt for the journey AI to discuss this record. */
export function cpEncounterPrompt(enc: CPEncounter): string {
  const lines = [
    `You are my community pharmacy preceptor discussing this patient encounter I just logged.`,
    `Be Socratic first — ask me 2-3 probing questions — then give detailed teaching.`,
    ``,
    `ENCOUNTER: ${enc.title}`,
    `Type: ${CP_ENCOUNTER_TYPES.find((t) => t.key === enc.encounterType)?.label ?? enc.encounterType}`,
    `Date: ${enc.date}`,
    ``,
    `PATIENT SAID (verbatim):\n${enc.patientPresentation || '(not recorded)'}`,
    ``,
    `Patient context: ${JSON.stringify(enc.patientContext)}`,
    `Symptoms: ${(enc.symptoms || []).join(', ') || '(not listed)'}`,
    `Duration: ${enc.duration || '—'}`,
    `Red flags I noticed: ${(enc.redFlags || []).join(', ') || '(none noted)'}`,
    ``,
    `My action: ${CP_ACTION_TYPES.find((a) => a.key === enc.actionTaken)?.label ?? enc.actionTaken}`,
    `Recommended: ${enc.recommendedProduct || '—'}`,
    `Dose: ${enc.dosageGiven || '—'}`,
    `Counselling I gave: ${(enc.counsellingProvided || []).join('; ') || '—'}`,
    `Warnings I gave: ${(enc.warningsGiven || []).join('; ') || '—'}`,
    `Follow-up: ${CP_FOLLOWUPS.find((f) => f.key === enc.followUp)?.label ?? enc.followUp ?? 'none'}`,
    `Referral reason: ${enc.referralReason || '—'}`,
    `My confidence: ${enc.confidence ?? '—'}/5`,
    `My reflection: ${enc.reflection || '(not written)'}`,
    `Knowledge gaps I want to study: ${(enc.knowledgeGaps || []).join(', ') || '—'}`,
    ``,
    `Please: (1) tell me what I did well, (2) what red flags or drug interactions I might have missed, (3) what the ideal pharmacist would do, (4) teach me the drug/class involved and counselling pearls, (5) suggest 2-3 Socratic questions to test my reasoning. Use West-African / Ghanaian community-pharmacy context where relevant.`,
  ];
  return lines.join('\n');
}

export function cpDrugCardPrompt(card: CPDrugCard): string {
  const lines = [
    `You are my community pharmacy tutor teaching me this drug like I'm standing behind the counter.`,
    `Drug: ${card.genericName} ${card.brandNames?.length ? '(' + card.brandNames.join(', ') + ')' : ''}`,
    `Class: ${card.drugClass || '?'}   Schedule: ${card.schedule || '?'}`,
    ``,
    `What I already have:`,
    `Common community indications: ${(card.indicationsCommunity || []).join(', ') || '—'}`,
    `Contraindications: ${(card.contraindications || []).join(', ') || '—'}`,
    `Cautions: ${(card.cautions || []).join(', ') || '—'}`,
    `Side effects to warn about: ${(card.commonSideEffects || []).join(', ') || '—'}`,
    `Interactions I MUST catch: ${(card.interactionsToFlag || []).join(', ') || '—'}`,
    `Counselling points (my version): ${(card.counsellingPoints || []).join('; ') || '—'}`,
    `Red flags that mean refer: ${(card.redFlagsRefer || []).join(', ') || '—'}`,
    `Dose (adult): ${card.doseAdult || '?'}   Dose (child): ${card.doseChild || '?'}`,
    `My confidence: ${card.confidence ?? '?'}/5   Mnemonic: ${card.mnemonic || '—'}`,
    ``,
    `Please fill gaps, correct anything wrong, give me the exact 30-second counselling script a community pharmacist would actually say, highlight the 2-3 interactions or red flags that get pharmacists in trouble, and end with 3 Socratic questions.`,
  ];
  return lines.join('\n');
}

export function cpScenarioPrompt(s: CPScenario, withAnswer = false): string {
  const head = withAnswer
    ? `You are my preceptor. Here is a community-pharmacy scenario plus my answer. Give feedback: what did I get right, what did I miss (red flags!), what would the ideal pharmacist do, and 2-3 teaching points.`
    : `You are my community pharmacy preceptor. Present this scenario to me like a real patient walking up to the counter and ask me what I would do. Wait for my answer before giving feedback. Make it feel like real life.`;
  return [
    head,
    ``,
    `Scenario: ${s.scenario}`,
    `Difficulty: ${s.difficulty || 'beginner'}`,
    `Tags: ${(s.tags || []).join(', ') || '—'}`,
    withAnswer ? `\nMy answer:\n${s.studentAnswer || '(blank)'}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---- Generic persistence ----------------------------------------------

/** Save any professional record. The store stamps academic context on create. */
export async function saveCareerRecord<T extends BaseRecord>(module: ModuleType, record: T): Promise<T> {
  const rec = { ...record, updatedAt: Date.now() };
  await useData.getState().save(module, rec);
  // Re-read so the caller gets the store-stamped copy.
  const list = useData.getState().all(module);
  return (list.find((r) => r.id === rec.id) as T) ?? rec;
}

export async function deleteCareerRecord(module: ModuleType, id: string): Promise<void> {
  await useData.getState().remove(module, id);
}

// ---- Evidence ----------------------------------------------------------

/**
 * Human title of any record in the app, for building an EvidenceRef label.
 * Different modules name their title field differently (a ward round has
 * `ward`, a medicine has `name`), so the fallback chain is explicit.
 */
export function titleOf(module: string, id: string): string | null {
  const st = useData.getState();
  try {
    const rec: any = st.getById(module as ModuleType, id);
    if (!rec) return null;
    switch (module) {
      case 'wardRound':
        return [rec.ward, rec.date].filter(Boolean).join(' — ') || 'Ward round';
      case 'wardEntry':
        return rec.label ?? rec.text ?? 'Ward entry';
      case 'leadership':
        return [rec.position, rec.organization].filter(Boolean).join(' — ') || 'Leadership role';
      case 'day':
        return rec.date ? `Clinical day ${rec.date}` : 'Clinical day';
      default:
        return rec.title ?? rec.name ?? rec.question ?? rec.label ?? null;
    }
  } catch {
    return null;
  }
}

export function buildEvidence(type: string, id: string, note?: string): EvidenceRef {
  return { type, id, label: titleOf(type, id) ?? 'Untitled', note };
}

/** Attach evidence to a record without duplicating the referenced data. */
export async function attachEvidence<T extends BaseRecord & { evidence?: EvidenceRef[] }>(
  module: ModuleType,
  record: T,
  ref: EvidenceRef
): Promise<T> {
  const existing = record.evidence ?? [];
  if (existing.some((e) => e.type === ref.type && e.id === ref.id)) return record;
  return saveCareerRecord(module, { ...record, evidence: [...existing, ref] });
}

export async function detachEvidence<T extends BaseRecord & { evidence?: EvidenceRef[] }>(
  module: ModuleType,
  record: T,
  type: string,
  id: string
): Promise<T> {
  const next = (record.evidence ?? []).filter((e) => !(e.type === type && e.id === id));
  return saveCareerRecord(module, { ...record, evidence: next });
}

export interface ResolvedEvidence extends EvidenceRef {
  /** False when the referenced record has since been deleted. */
  exists: boolean;
  /** What to show the user — degrades gracefully instead of disappearing. */
  display: string;
}

/**
 * Resolve evidence links for display.
 *
 * DELETE SAFETY: if the referenced record is gone, the link is NOT removed and
 * the skill/achievement is NOT touched. The user simply sees that the original
 * no longer exists, so their professional record stays intact.
 */
export function resolveEvidence(refs: EvidenceRef[] | undefined): ResolvedEvidence[] {
  return (refs ?? []).map((ref) => {
    const current = titleOf(ref.type, ref.id);
    return current
      ? { ...ref, exists: true, display: current }
      : { ...ref, exists: false, display: `${ref.label} — original ${ref.type} no longer exists` };
  });
}

/** Every professional record that cites a given record as evidence. */
export function evidenceBacklinks(type: string, id: string): Array<{ module: ModuleType; record: any }> {
  const st = useData.getState();
  const out: Array<{ module: ModuleType; record: any }> = [];
  for (const m of CAREER_MODULES) {
    for (const rec of st.all(m.module) as any[]) {
      if ((rec.evidence ?? []).some((e: EvidenceRef) => e.type === type && e.id === id)) {
        out.push({ module: m.module, record: rec });
      }
    }
  }
  return out;
}

// ---- Goals & milestones ------------------------------------------------

/** Progress is DERIVED from real milestone completion — never estimated. */
export function goalProgress(goal: Goal): { done: number; total: number; percent: number } {
  const ms = goal.milestones ?? [];
  if (!ms.length) return { done: 0, total: 0, percent: goal.status === 'completed' ? 100 : 0 };
  const done = ms.filter((m) => m.done).length;
  return { done, total: ms.length, percent: Math.round((done / ms.length) * 100) };
}

export async function toggleMilestone(goal: Goal, milestoneId: string): Promise<Goal> {
  const milestones = (goal.milestones ?? []).map((m) =>
    m.id === milestoneId ? { ...m, done: !m.done, doneAt: !m.done ? Date.now() : undefined } : m
  );
  // Starting the first milestone moves a goal out of "not started"; the user
  // still owns the final "completed" decision.
  let status = goal.status;
  if (status === 'not-started' && milestones.some((m) => m.done)) status = 'active';
  return saveCareerRecord('goal', { ...goal, milestones, status });
}

export async function addMilestone(goal: Goal, title: string): Promise<Goal> {
  return saveCareerRecord('goal', { ...goal, milestones: [...(goal.milestones ?? []), newMilestone(title)] });
}

export async function removeMilestone(goal: Goal, milestoneId: string): Promise<Goal> {
  return saveCareerRecord('goal', {
    ...goal,
    milestones: (goal.milestones ?? []).filter((m) => m.id !== milestoneId),
  });
}

// ---- Clinical experience ↔ ward rounds ---------------------------------

/** Ward rounds that fall inside a rotation's date window. */
export function roundsInExperience(exp: ClinicalExperience): any[] {
  const st = useData.getState();
  const explicit = new Set(exp.relatedRoundIds ?? []);
  const end = exp.endDate || '9999-12-31';
  return st.wardRounds.filter((r) => explicit.has(r.id) || (r.date >= exp.startDate && r.date <= end));
}

/** The rotation (if any) a ward round belongs to. */
export function experienceForRound(roundId: string): ClinicalExperience | null {
  const st = useData.getState();
  const round = st.wardRounds.find((r) => r.id === roundId);
  if (!round) return null;
  return (
    st.clinicalExperiences.find(
      (e) => (e.relatedRoundIds ?? []).includes(roundId) || (round.date >= e.startDate && round.date <= (e.endDate || '9999-12-31'))
    ) ?? null
  );
}

export async function linkRoundToExperience(exp: ClinicalExperience, roundId: string): Promise<ClinicalExperience> {
  const ids = new Set(exp.relatedRoundIds ?? []);
  ids.add(roundId);
  return saveCareerRecord('clinicalExperience', { ...exp, relatedRoundIds: [...ids] });
}

// ---- Visibility & portfolio -------------------------------------------

export async function setVisibility<T extends BaseRecord & { visibility?: Visibility }>(
  module: ModuleType,
  record: T,
  visibility: Visibility
): Promise<T> {
  return saveCareerRecord(module, { ...record, visibility });
}

/** Records the user has explicitly promoted. Private records never appear. */
export function portfolioRecords(): Array<{ module: ModuleType; label: string; icon: string; records: any[] }> {
  const st = useData.getState();
  return CAREER_MODULES.map((m) => ({
    module: m.module,
    label: m.label,
    icon: m.icon,
    records: (st.all(m.module) as any[]).filter(
      (r) => (r.visibility === 'portfolio' || r.visibility === 'export') && !r.archived
    ),
  })).filter((g) => g.records.length > 0);
}

/** Only records explicitly approved to leave the app. */
export function exportableRecords(): Array<{ module: ModuleType; label: string; icon: string; records: any[] }> {
  const st = useData.getState();
  return CAREER_MODULES.map((m) => ({
    module: m.module,
    label: m.label,
    icon: m.icon,
    records: (st.all(m.module) as any[]).filter((r) => r.visibility === 'export' && !r.archived),
  })).filter((g) => g.records.length > 0);
}

// ---- Academic snapshots ------------------------------------------------

function inStage(rec: any, stageId: string): boolean {
  return rec?.academic?.stageId === stageId;
}

/**
 * Real counts for one academic stage.
 *
 * Every number is a count of actual stored records filtered by their ORIGINAL
 * academic stamp. Nothing is estimated, projected or invented.
 */
export function stageSnapshot(stageId: string): StageSnapshot | null {
  const stage = getStage(stageId);
  if (!stage) return null;
  const st = useData.getState();
  const count = (list: any[]) => list.filter((r) => inStage(r, stageId)).length;

  return {
    stageId,
    stageName: stage.name,
    level: stage.level,
    academicYear: stage.academicYear,
    status: stage.status,
    counts: {
      courses: st.courses.filter((c) => c.stageId === stageId).length,
      lessons: count(st.lessons),
      diseases: count(st.diseases),
      medicines: count(st.medicines),
      investigations: count(st.investigations),
      wardRounds: count(st.wardRounds),
      questions: count(st.questions),
      bundles: count(st.bundles),
      clinicalExperiences: count(st.clinicalExperiences),
      skills: count(st.skills),
      achievements: count(st.achievements),
      projects: count(st.projects),
      research: count(st.research),
      leadership: count(st.leadership),
      goals: count(st.goals),
      certifications: st.certifications.length, // certifications are not level-bound
    },
  };
}

export function allStageSnapshots(): StageSnapshot[] {
  return allStages()
    .map((s) => stageSnapshot(s.id))
    .filter((s): s is StageSnapshot => !!s);
}

/** Side-by-side comparison, e.g. Level 200 vs Level 300. */
export function compareStages(aId: string, bId: string): {
  a: StageSnapshot | null;
  b: StageSnapshot | null;
  rows: Array<{ label: string; a: number; b: number; delta: number }>;
} {
  const a = stageSnapshot(aId);
  const b = stageSnapshot(bId);
  const keys: Array<[keyof StageSnapshot['counts'], string]> = [
    ['courses', 'Courses'],
    ['lessons', 'Learning notes'],
    ['diseases', 'Diseases'],
    ['medicines', 'Medicines'],
    ['investigations', 'Investigations'],
    ['wardRounds', 'Ward rounds'],
    ['questions', 'Questions'],
    ['bundles', 'Bundles'],
    ['clinicalExperiences', 'Clinical experiences'],
    ['skills', 'Skills'],
    ['achievements', 'Achievements'],
    ['projects', 'Projects'],
  ];
  const rows = keys.map(([k, label]) => {
    const av = a?.counts[k] ?? 0;
    const bv = b?.counts[k] ?? 0;
    return { label, a: av, b: bv, delta: bv - av };
  });
  return { a, b, rows };
}

// ---- Archive -----------------------------------------------------------

export interface StageArchive {
  stage: ReturnType<typeof getStage>;
  snapshot: StageSnapshot | null;
  groups: Array<{ key: string; label: string; icon: string; records: any[] }>;
}

/**
 * Everything associated with one academic stage — the "Level 200 Archive".
 * Reads by original stamp, so it keeps working forever after promotion.
 */
export function stageArchive(stageId: string): StageArchive {
  const st = useData.getState();
  const pick = (list: any[]) => list.filter((r) => inStage(r, stageId));

  const groups = [
    { key: 'course', label: 'Courses', icon: '📘', records: st.courses.filter((c) => c.stageId === stageId) },
    { key: 'lesson', label: 'Learning Notes', icon: '💡', records: pick(st.lessons) },
    { key: 'disease', label: 'Diseases', icon: '🦠', records: pick(st.diseases) },
    { key: 'medicine', label: 'Medicines', icon: '💊', records: pick(st.medicines) },
    { key: 'investigation', label: 'Investigations', icon: '🧪', records: pick(st.investigations) },
    { key: 'wardRound', label: 'Ward Rounds', icon: '🏥', records: pick(st.wardRounds) },
    { key: 'question', label: 'Questions', icon: '❓', records: pick(st.questions) },
    { key: 'revision', label: 'Revision', icon: '📚', records: pick(st.revisions) },
    { key: 'bundle', label: 'Bundles', icon: '📦', records: pick(st.bundles) },
    { key: 'clinicalExperience', label: 'Clinical Experience', icon: '🏥', records: pick(st.clinicalExperiences) },
    { key: 'skill', label: 'Skills', icon: '🧠', records: pick(st.skills) },
    { key: 'achievement', label: 'Achievements', icon: '🏆', records: pick(st.achievements) },
    { key: 'project', label: 'Projects', icon: '💻', records: pick(st.projects) },
    { key: 'research', label: 'Research', icon: '🔬', records: pick(st.research) },
    { key: 'leadership', label: 'Leadership', icon: '🏅', records: pick(st.leadership) },
    { key: 'goal', label: 'Goals', icon: '🎯', records: pick(st.goals) },
  ].filter((g) => g.records.length > 0);

  return { stage: getStage(stageId), snapshot: stageSnapshot(stageId), groups };
}

// ---- Professional timeline --------------------------------------------

export interface TimelineEvent {
  date: string;
  year: string;
  type: string;
  icon: string;
  title: string;
  detail?: string;
  module?: ModuleType;
  id?: string;
}

/** Major milestones across the whole journey, from real dated records. */
export function professionalTimeline(limit = 200): TimelineEvent[] {
  const st = useData.getState();
  const events: TimelineEvent[] = [];
  const yearOf = (d: string) => (d || '').slice(0, 4);

  for (const s of allStages()) {
    const date = s.startDate || `${s.academicYear.slice(0, 4)}-09-01`;
    events.push({
      date,
      year: yearOf(date),
      type: 'Academic stage',
      icon: '🎓',
      title: s.name,
      detail: `${s.academicYear} · ${s.status}`,
      module: 'academicStage',
      id: s.id,
    });
  }
  for (const e of st.clinicalExperiences) {
    events.push({
      date: e.startDate,
      year: yearOf(e.startDate),
      type: 'Clinical experience',
      icon: '🏥',
      title: e.title,
      detail: [e.institution, e.clinicalArea].filter(Boolean).join(' · '),
      module: 'clinicalExperience',
      id: e.id,
    });
  }
  for (const p of st.projects) {
    if (!p.startDate) continue;
    events.push({
      date: p.startDate,
      year: yearOf(p.startDate),
      type: 'Project',
      icon: '💻',
      title: p.title,
      detail: p.status,
      module: 'project',
      id: p.id,
    });
  }
  for (const r of st.research) {
    if (!r.startDate) continue;
    events.push({ date: r.startDate, year: yearOf(r.startDate), type: 'Research', icon: '🔬', title: r.title, module: 'research', id: r.id });
  }
  for (const l of st.leadership) {
    events.push({
      date: l.startDate,
      year: yearOf(l.startDate),
      type: 'Leadership',
      icon: '🏅',
      title: `${l.position} — ${l.organization}`,
      module: 'leadership',
      id: l.id,
    });
  }
  for (const a of st.achievements) {
    events.push({ date: a.date, year: yearOf(a.date), type: 'Achievement', icon: '🏆', title: a.title, module: 'achievement', id: a.id });
  }
  for (const c of st.certifications) {
    events.push({
      date: c.dateObtained,
      year: yearOf(c.dateObtained),
      type: 'Certification',
      icon: '📜',
      title: c.title,
      detail: c.issuer,
      module: 'certification',
      id: c.id,
    });
  }

  return events
    .filter((e) => !!e.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Timeline grouped by calendar year, for the year-banded view. */
export function timelineByYear(): Array<{ year: string; events: TimelineEvent[] }> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of professionalTimeline(500)) {
    const list = groups.get(e.year) ?? [];
    list.push(e);
    groups.set(e.year, list);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, events]) => ({ year, events }));
}

// ---- Skills roll-up ----------------------------------------------------

export function skillsByCategory(): Array<{ category: SkillCategory; label: string; icon: string; skills: Skill[] }> {
  const st = useData.getState();
  return SKILL_CATEGORIES.map((c) => ({
    category: c.key,
    label: c.label,
    icon: c.icon,
    skills: st.skills.filter((s) => s.category === c.key && !s.archived),
  })).filter((g) => g.skills.length > 0);
}

/**
 * Skills with the least supporting evidence.
 *
 * This is an EVIDENCE GAP, not a competence judgement — it only reports how
 * many links the student attached.
 */
export function skillEvidenceGaps(): Array<{ skill: Skill; evidenceCount: number }> {
  return useData
    .getState()
    .skills.filter((s) => !s.archived)
    .map((s) => ({ skill: s, evidenceCount: (s.evidence ?? []).length }))
    .sort((a, b) => a.evidenceCount - b.evidenceCount);
}

// ---- Journey dashboard -------------------------------------------------

export interface JourneySummary {
  stage: ReturnType<typeof getStage>;
  academic: { courses: number; lessons: number; recentLessons: any[] };
  clinical: { rotations: number; wardRounds: number; skills: number; activeRotation: ClinicalExperience | null };
  professional: { projects: number; research: number; leadership: number; achievements: number; certifications: number };
  goals: { active: Goal[]; total: number };
  timeline: TimelineEvent[];
}

/** Everything the PharmD Journey home screen needs, from real data. */
export function journeySummary(): JourneySummary {
  const st = useData.getState();
  const stage = getStage(st.profile?.currentStageId) ?? allStages().find((s) => s.status === 'current') ?? null;
  const sid = stage?.id;
  const today = todayIso();

  const scoped = <T extends { academic?: any }>(list: T[]) => (sid ? list.filter((r) => r.academic?.stageId === sid) : list);

  return {
    stage,
    academic: {
      courses: sid ? st.courses.filter((c) => c.stageId === sid).length : st.courses.length,
      lessons: scoped(st.lessons).length,
      recentLessons: [...st.lessons].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    },
    clinical: {
      rotations: scoped(st.clinicalExperiences).length,
      wardRounds: scoped(st.wardRounds).length,
      skills: st.skills.filter((s) => !s.archived).length,
      activeRotation:
        st.clinicalExperiences.find((e) => e.startDate <= today && (!e.endDate || e.endDate >= today)) ?? null,
    },
    professional: {
      projects: st.projects.filter((p) => !p.archived).length,
      research: st.research.filter((r) => !r.archived).length,
      leadership: st.leadership.filter((l) => !l.archived).length,
      achievements: st.achievements.filter((a) => !a.archived).length,
      certifications: st.certifications.filter((c) => !c.archived).length,
    },
    goals: {
      active: st.goals.filter((g) => g.status === 'active'),
      total: st.goals.filter((g) => g.status !== 'archived').length,
    },
    timeline: professionalTimeline(8),
  };
}

// ---- Knowledge growth --------------------------------------------------

export interface GrowthRow {
  stageId: string;
  label: string;
  diseases: number;
  medicines: number;
  investigations: number;
  questions: number;
  wardRounds: number;
  clinicalExperiences: number;
  revisions: number;
}

/** Long-term learning growth by level. Real counts only — no scores. */
export function knowledgeGrowth(): GrowthRow[] {
  const st = useData.getState();
  return allStages().map((s) => {
    const c = (list: any[]) => list.filter((r) => r.academic?.stageId === s.id).length;
    return {
      stageId: s.id,
      label: `${s.name} (${s.academicYear})`,
      diseases: c(st.diseases),
      medicines: c(st.medicines),
      investigations: c(st.investigations),
      questions: c(st.questions),
      wardRounds: c(st.wardRounds),
      clinicalExperiences: c(st.clinicalExperiences),
      revisions: c(st.revisions),
    };
  });
}
