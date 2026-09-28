import { useData, uid } from '../stores/data';
import { currentAcademicLink, getStage } from './academic';
import type {
  ActivityEntry,
  Disease,
  Investigation,
  Lesson,
  Medicine,
  ModuleType,
  Question,
  RevisionItem,
} from '../types';

/**
 * Clinical Learning Core (Phase 2).
 *
 * A service layer over the knowledge modules that already ship (diseases,
 * medicines, investigations, questions, lessons) adding:
 *  - academic stamping, so every record keeps the level/year/semester it was
 *    created in, forever
 *  - relationships between records, resolved by name OR id
 *  - cross-cutting filtering, search, tags, favourites and activity history
 *  - clean context retrieval that future AI/bundlers/ward-rounds can call
 *
 * Everything here is local-only and works with no network.
 */

export const KNOWLEDGE_MODULES: ModuleType[] = ['lesson', 'disease', 'medicine', 'investigation', 'question'];

export const MODULE_META: Record<string, { icon: string; label: string; plural: string; route: string }> = {
  lesson: { icon: '💡', label: 'Learning Note', plural: 'Learning Notes', route: '/revision' },
  disease: { icon: '🦠', label: 'Disease', plural: 'Diseases', route: '/diseases' },
  medicine: { icon: '💊', label: 'Medicine', plural: 'Medicines', route: '/medicines' },
  investigation: { icon: '🧪', label: 'Investigation', plural: 'Investigations', route: '/investigations' },
  question: { icon: '❓', label: 'Question', plural: 'Questions', route: '/questions' },
  revision: { icon: '📚', label: 'Revision item', plural: 'Revision', route: '/revision' },
  course: { icon: '📚', label: 'Course', plural: 'Courses', route: '/courses' },
};

// ---- Academic stamping -------------------------------------------------

/**
 * Stamp a record with the CURRENT academic context, but never overwrite an
 * existing stamp — historical records keep the level they were created in
 * even after the user is promoted.
 */
export function stampAcademic<T extends { academic?: any }>(record: T): T {
  if (record.academic?.stageId) return record;
  const link = currentAcademicLink();
  const stage = getStage(link.stageId);
  return { ...record, academic: { ...link, level: stage?.level } };
}

/** Human label for a record's academic context, e.g. "Level 200 · 2026/2027". */
export function academicLabel(rec: { academic?: any }): string {
  const a = rec.academic;
  if (!a) return '';
  const stage = getStage(a.stageId);
  const parts = [stage?.name ?? (a.level ? `Level ${a.level}` : ''), a.academicYear].filter(Boolean);
  return parts.join(' · ');
}

// ---- Activity history --------------------------------------------------

/** Record an activity entry (best-effort; never blocks the main action). */
export async function logActivity(
  action: ActivityEntry['action'],
  module: ModuleType,
  recordId: string,
  label: string
): Promise<void> {
  try {
    const now = Date.now();
    const entry: ActivityEntry = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      action,
      module,
      recordId,
      label: label.slice(0, 140),
      academic: currentAcademicLink(),
    };
    await useData.getState().save('activity', entry);
    // Keep the log bounded so it never grows without limit.
    const all = useData.getState().activities;
    if (all.length > 400) {
      const oldest = [...all].sort((a, b) => a.createdAt - b.createdAt).slice(0, all.length - 400);
      for (const o of oldest) await useData.getState().remove('activity', o.id);
    }
  } catch {
    /* activity logging must never break a save */
  }
}

export interface ActivityGroup {
  label: string;
  entries: ActivityEntry[];
}

/** Recent activity grouped into Today / Yesterday / dates. */
export function recentActivity(limit = 30): ActivityGroup[] {
  const items = [...useData.getState().activities].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  const groups = new Map<string, ActivityEntry[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  for (const e of items) {
    const d = new Date(e.createdAt).toDateString();
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(e.createdAt).toLocaleDateString();
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

// ---- Recently viewed ---------------------------------------------------

const RECENT_KEY = 'clinical-rx:recently-viewed';

export interface RecentItem {
  module: ModuleType;
  id: string;
  label: string;
  ts: number;
}

export function markViewed(module: ModuleType, id: string, label: string): void {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: RecentItem[] = raw ? JSON.parse(raw) : [];
    const next = [{ module, id, label, ts: Date.now() }, ...list.filter((r) => !(r.module === module && r.id === id))].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function recentlyViewed(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: RecentItem[] = raw ? JSON.parse(raw) : [];
    // Drop entries whose record has since been deleted.
    const st = useData.getState();
    return list.filter((r) => (st.all(r.module) as any[]).some((x) => x.id === r.id));
  } catch {
    return [];
  }
}

// ---- Relationships -----------------------------------------------------

export interface Related {
  medicines: Medicine[];
  diseases: Disease[];
  investigations: Investigation[];
  lessons: Lesson[];
  questions: Question[];
}

function nameMatches(haystack: string[] | undefined, name: string): boolean {
  if (!haystack?.length || !name) return false;
  const n = name.toLowerCase();
  return haystack.some((h) => String(h).toLowerCase() === n);
}

function textMentions(text: string | undefined, name: string): boolean {
  if (!text || !name) return false;
  return text.toLowerCase().includes(name.toLowerCase());
}

/**
 * Everything connected to a record. Relationships are resolved from the
 * existing name-based arrays (disease.medicines, investigation.linkedConditions)
 * AND from explicit ids on questions — so links work for records created before
 * Phase 2 without any migration.
 */
export function relatedTo(module: ModuleType, id: string): Related {
  const s = useData.getState();
  const empty: Related = { medicines: [], diseases: [], investigations: [], lessons: [], questions: [] };
  const rec: any = (s.all(module) as any[]).find((r) => r.id === id);
  if (!rec) return empty;
  const name: string = rec.name ?? rec.title ?? rec.text ?? '';

  if (module === 'disease') {
    return {
      medicines: s.medicines.filter((m) => nameMatches(rec.medicines, m.name) || nameMatches((m as any).indications, name)),
      diseases: [],
      investigations: s.investigations.filter((i) => nameMatches(i.linkedConditions, name) || textMentions(rec.dt, i.name)),
      lessons: s.lessons.filter((l) => textMentions(l.title, name) || textMentions(l.content, name)),
      questions: s.questions.filter((q) => q.diseaseId === id || textMentions(q.text, name)),
    };
  }
  if (module === 'medicine') {
    return {
      medicines: [],
      diseases: s.diseases.filter((d) => nameMatches(d.medicines, name)),
      investigations: s.investigations.filter((i) => textMentions(i.clinicalSignificance, name) || textMentions(i.whyRequested, name)),
      lessons: s.lessons.filter((l) => textMentions(l.title, name) || textMentions(l.content, name)),
      questions: s.questions.filter((q) => q.medicineId === id || textMentions(q.text, name)),
    };
  }
  if (module === 'investigation') {
    return {
      medicines: s.medicines.filter((m) => textMentions(m.counselling, name)),
      diseases: s.diseases.filter((d) => nameMatches(rec.linkedConditions, d.name) || textMentions(d.dt, name)),
      investigations: [],
      lessons: s.lessons.filter((l) => textMentions(l.title, name) || textMentions(l.content, name)),
      questions: s.questions.filter((q) => q.investigationId === id || textMentions(q.text, name)),
    };
  }
  if (module === 'question') {
    return {
      medicines: s.medicines.filter((m) => m.id === rec.medicineId || textMentions(rec.text, m.name)),
      diseases: s.diseases.filter((d) => d.id === rec.diseaseId || textMentions(rec.text, d.name)),
      investigations: s.investigations.filter((i) => i.id === rec.investigationId || textMentions(rec.text, i.name)),
      lessons: [],
      questions: [],
    };
  }
  if (module === 'lesson') {
    const body = `${rec.title} ${rec.content}`;
    return {
      medicines: s.medicines.filter((m) => textMentions(body, m.name)),
      diseases: s.diseases.filter((d) => textMentions(body, d.name)),
      investigations: s.investigations.filter((i) => textMentions(body, i.name)),
      lessons: [],
      questions: s.questions.filter((q) => textMentions(q.text, rec.title)),
    };
  }
  return empty;
}

export function relatedCount(r: Related): number {
  return r.medicines.length + r.diseases.length + r.investigations.length + r.lessons.length + r.questions.length;
}

// ---- Filtering ---------------------------------------------------------

export interface LearningFilter {
  stageId?: string;
  level?: string;
  academicYear?: string;
  periodId?: string;
  courseId?: string;
  tag?: string;
  favorite?: boolean;
  query?: string;
  from?: string; // yyyy-mm-dd
  to?: string;
}

function recText(rec: any): string {
  return [rec.name, rec.title, rec.text, rec.content, rec.className, rec.what, rec.why, rec.interpretation, rec.personalNotes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function recDate(rec: any): string {
  if (rec.date) return rec.date;
  if (rec.lastSeen) return rec.lastSeen;
  const d = new Date(rec.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Apply a filter to any list of learning records. */
export function applyFilter<T extends Record<string, any>>(records: T[], f: LearningFilter): T[] {
  return records.filter((r) => {
    if (r.archived) return false;
    const a = r.academic ?? {};
    if (f.stageId && a.stageId !== f.stageId) return false;
    if (f.level && String(a.level ?? '') !== String(f.level)) return false;
    if (f.academicYear && a.academicYear !== f.academicYear) return false;
    if (f.periodId && a.periodId !== f.periodId) return false;
    if (f.courseId && a.courseId !== f.courseId) return false;
    if (f.tag && !(r.tags ?? []).includes(f.tag)) return false;
    if (f.favorite && !r.favorite) return false;
    if (f.from && recDate(r) < f.from) return false;
    if (f.to && recDate(r) > f.to) return false;
    if (f.query && !recText(r).includes(f.query.toLowerCase())) return false;
    return true;
  });
}

/** Filter every knowledge module at once. */
export function filterAll(f: LearningFilter): Record<string, any[]> {
  const s = useData.getState();
  return {
    lesson: applyFilter(s.lessons, f),
    disease: applyFilter(s.diseases, f),
    medicine: applyFilter(s.medicines, f),
    investigation: applyFilter(s.investigations, f),
    question: applyFilter(s.questions, f),
  };
}

// ---- Search ------------------------------------------------------------

export interface SearchHit {
  module: ModuleType;
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  academic: string;
}

/** Offline search across every knowledge module, grouped by type. */
export function searchLearning(query: string, f: LearningFilter = {}): Record<string, SearchHit[]> {
  const q = query.trim().toLowerCase();
  const out: Record<string, SearchHit[]> = {};
  if (!q) return out;
  const groups = filterAll({ ...f, query: q });
  for (const [module, list] of Object.entries(groups)) {
    if (!list.length) continue;
    out[module] = list.map((r: any) => ({
      module: module as ModuleType,
      id: r.id,
      title: r.name ?? r.title ?? r.text ?? 'Untitled',
      subtitle: r.className ?? r.what ?? r.content ?? r.interpretation ?? MODULE_META[module].label,
      icon: MODULE_META[module].icon,
      academic: academicLabel(r),
    }));
  }
  return out;
}

// ---- Tags --------------------------------------------------------------

export function allTags(): Array<{ tag: string; count: number }> {
  const s = useData.getState();
  const counts = new Map<string, number>();
  for (const list of [s.lessons, s.diseases, s.medicines, s.investigations, s.questions] as any[][]) {
    for (const r of list) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function toggleFavorite(module: ModuleType, id: string): Promise<boolean> {
  const st = useData.getState();
  const rec: any = (st.all(module) as any[]).find((r) => r.id === id);
  if (!rec) return false;
  const next = !rec.favorite;
  await st.save(module, { ...rec, favorite: next });
  if (next) await logActivity('favorited', module, id, rec.name ?? rec.title ?? rec.text ?? '');
  return next;
}

export function favorites(): SearchHit[] {
  const s = useData.getState();
  const out: SearchHit[] = [];
  for (const module of KNOWLEDGE_MODULES) {
    for (const r of (s.all(module) as any[]).filter((x) => x.favorite && !x.archived)) {
      out.push({
        module,
        id: r.id,
        title: r.name ?? r.title ?? r.text ?? 'Untitled',
        subtitle: r.className ?? r.what ?? r.content ?? MODULE_META[module].label,
        icon: MODULE_META[module].icon,
        academic: academicLabel(r),
      });
    }
  }
  return out;
}

// ---- Stats -------------------------------------------------------------

export interface LearningStats {
  lessons: number;
  diseases: number;
  medicines: number;
  investigations: number;
  questions: number;
  openQuestions: number;
  revision: number;
  dueRevision: number;
  favorites: number;
  tags: number;
}

export function learningStats(f: LearningFilter = {}): LearningStats {
  const s = useData.getState();
  const g = filterAll(f);
  const revision = s.revisions.filter((r) => !(r as any).archived);
  const now = Date.now();
  return {
    lessons: g.lesson.length,
    diseases: g.disease.length,
    medicines: g.medicine.length,
    investigations: g.investigation.length,
    questions: g.question.length,
    openQuestions: g.question.filter((q: Question) => q.status !== 'answered').length,
    revision: revision.length,
    dueRevision: revision.filter((r) => (r.nextReview ?? 0) <= now).length,
    favorites: favorites().length,
    tags: allTags().length,
  };
}

/** Knowledge counts per academic stage — the cross-year progression view. */
export function knowledgeByStage(): Array<{ stageId: string; label: string; counts: Record<string, number>; total: number }> {
  const s = useData.getState();
  const stages = s.academicStages;
  const rows: Array<{ stageId: string; label: string; counts: Record<string, number>; total: number }> = [];
  for (const stage of [...stages].sort((a, b) => a.order - b.order)) {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const module of KNOWLEDGE_MODULES) {
      const n = (s.all(module) as any[]).filter((r) => !r.archived && r.academic?.stageId === stage.id).length;
      counts[module] = n;
      total += n;
    }
    rows.push({ stageId: stage.id, label: `${stage.name} · ${stage.academicYear}`, counts, total });
  }
  return rows;
}

// ---- Revision linkage --------------------------------------------------

/** Add any knowledge record to the revision queue (no duplicates). */
export async function addToRevision(module: ModuleType, id: string): Promise<RevisionItem | null> {
  const st = useData.getState();
  const rec: any = (st.all(module) as any[]).find((r) => r.id === id);
  if (!rec) return null;
  const topic = rec.name ?? rec.title ?? rec.text ?? 'Topic';
  const existing = st.revisions.find((r) => (r as any).sourceId === id || r.topic.toLowerCase() === String(topic).toLowerCase());
  if (existing) return existing;
  const now = Date.now();
  const item: RevisionItem = {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    topic,
    module,
    items: [],
    due: true,
    box: 0,
    nextReview: now,
    failCount: 0,
    passCount: 0,
    sourceModule: module,
    sourceId: id,
  };
  await st.save('revision', item);
  await logActivity('reviewed', 'revision', item.id, `Marked "${topic}" for revision`);
  return item;
}

export function isInRevision(id: string): boolean {
  return useData.getState().revisions.some((r) => (r as any).sourceId === id);
}

export async function setConfidence(itemId: string, confidence: 1 | 2 | 3 | 4 | 5): Promise<void> {
  const st = useData.getState();
  const item = st.revisions.find((r) => r.id === itemId);
  if (!item) return;
  await st.save('revision', { ...item, confidence });
}

// ---- Context retrieval for future AI / bundlers / ward rounds ----------

export interface LearningContext {
  profile: { name?: string; programme?: string; level?: string; institution?: string };
  academic: { stage?: string; year?: string; semester?: string };
  counts: LearningStats;
  diseases: Array<{ id: string; name: string; tags?: string[] }>;
  medicines: Array<{ id: string; name: string; className?: string; tags?: string[] }>;
  investigations: Array<{ id: string; name: string }>;
  lessons: Array<{ id: string; title: string; content: string; date: string }>;
  questions: Array<{ id: string; text: string; status: string; answer?: string }>;
  revision: Array<{ topic: string; box?: number; confidence?: number; due: boolean }>;
}

/**
 * A clean, bounded snapshot of the user's learning for a given scope.
 * This is the single function future AI, bundlers and ward rounds should call
 * instead of reaching into the store — it already respects academic filtering.
 */
export function buildLearningContext(f: LearningFilter = {}, limit = 40): LearningContext {
  const s = useData.getState();
  const g = filterAll(f);
  const stage = getStage(f.stageId ?? s.profile?.currentStageId);
  const period = s.academicPeriods.find((p) => p.id === (f.periodId ?? s.profile?.currentPeriodId));
  const now = Date.now();
  return {
    profile: {
      name: s.profile?.username,
      programme: s.profile?.programme,
      level: s.profile?.level,
      institution: s.profile?.institution,
    },
    academic: { stage: stage?.name, year: stage?.academicYear, semester: period?.name },
    counts: learningStats(f),
    diseases: g.disease.slice(0, limit).map((d: Disease) => ({ id: d.id, name: d.name, tags: d.tags })),
    medicines: g.medicine.slice(0, limit).map((m: Medicine) => ({ id: m.id, name: m.name, className: m.className, tags: m.tags })),
    investigations: g.investigation.slice(0, limit).map((i: Investigation) => ({ id: i.id, name: i.name })),
    lessons: g.lesson.slice(0, limit).map((l: Lesson) => ({ id: l.id, title: l.title, content: l.content, date: l.date })),
    questions: g.question.slice(0, limit).map((q: Question) => ({ id: q.id, text: q.text, status: q.status, answer: q.answer })),
    revision: s.revisions
      .slice(0, limit)
      .map((r) => ({ topic: r.topic, box: r.box, confidence: (r as any).confidence, due: (r.nextReview ?? 0) <= now })),
  };
}

// ---- Safe delete -------------------------------------------------------

/**
 * Soft-delete a knowledge record: hidden from lists but recoverable, and it
 * never cascades into unrelated notes. Falls back to the store's own delete
 * (which supports undo) for modules without an `archived` flag.
 */
export async function softDelete(module: ModuleType, id: string): Promise<void> {
  const st = useData.getState();
  const rec: any = (st.all(module) as any[]).find((r) => r.id === id);
  if (!rec) return;
  await st.save(module, { ...rec, archived: true });
  await logActivity('deleted', module, id, rec.name ?? rec.title ?? rec.text ?? '');
  st.setStatus('✓ Moved to archive — your other records were not touched');
}

export async function restoreRecord(module: ModuleType, id: string): Promise<void> {
  const st = useData.getState();
  const rec: any = (st.all(module) as any[]).find((r) => r.id === id);
  if (!rec) return;
  await st.save(module, { ...rec, archived: false });
}

// ---- UNIFIED APP CONTEXT ----------------------------------------------

/**
 * ONE MEMORY FOR THE WHOLE APP.
 *
 * The Clinical workspace and the PharmD Journey workspace are two *views* of
 * a single dataset — never separate entities. This function is the single
 * source of truth that every AI module reads, so the AI can answer across
 * everything the user has ever recorded:
 *
 *   academic journey  ·  courses      ·  clinical days   ·  ward rounds
 *   diseases          ·  medicines    ·  investigations  ·  questions
 *   learning notes    ·  revision/SRS ·  quizzes         ·  bundles
 *   tags              ·  favourites   ·  recent activity
 *
 * Everything is cross-linked by academic stage, so "what did I learn about
 * statins in Level 200?" is answerable from this snapshot alone.
 *
 * Bounded on purpose: prompts stay small and fast, newest data wins.
 */
export function buildUnifiedContext(opts: { scope?: LearningFilter; limit?: number } = {}): string {
  const s = useData.getState();
  const f = opts.scope ?? {};
  const limit = opts.limit ?? 25;
  const g = filterAll(f);
  const now = Date.now();
  const lines: string[] = [];

  const list = (items: string[], max = limit) =>
    items.filter(Boolean).slice(0, max).join('; ') || 'none recorded';

  // --- Who the student is ---
  const p = s.profile;
  const stage = getStage(p?.currentStageId);
  const period = s.academicPeriods.find((x) => x.id === p?.currentPeriodId);
  lines.push('=== STUDENT ===');
  lines.push(
    `${p?.username ?? 'Student'} — ${p?.programme ?? 'Pharmacy'}${p?.institution ? ' at ' + p.institution : ''}.`
  );
  lines.push(
    `Currently: ${stage ? `${stage.name}, ${stage.academicYear}` : `Level ${p?.level ?? '?'}`}${period ? `, ${period.name}` : ''}.`
  );
  const prefs = s.settings?.learningProfile?.preferredExplanation ?? [];
  lines.push(`Preferred explanation style: ${prefs.length ? prefs.join(', ') : 'simple first, step-by-step'}.`);

  // --- The academic journey (PharmD workspace) ---
  const stages = [...s.academicStages].sort((a, b) => a.order - b.order);
  if (stages.length) {
    lines.push('');
    lines.push('=== ACADEMIC JOURNEY (all years remain accessible) ===');
    for (const st of stages) {
      const courses = s.courses.filter((c) => c.stageId === st.id).map((c) => c.title);
      const counts = KNOWLEDGE_MODULES.reduce((n, m) => n + (s.all(m) as any[]).filter((r) => !r.archived && r.academic?.stageId === st.id).length, 0);
      lines.push(
        `${st.name} (${st.academicYear}) — ${st.status}${courses.length ? `; courses: ${courses.join(', ')}` : ''}; ${counts} learning record(s).`
      );
    }
  }

  // --- Knowledge base (Clinical workspace) ---
  lines.push('');
  lines.push('=== KNOWLEDGE BASE ===');
  const withStage = (r: any) => {
    const a = academicLabel(r);
    return a ? ` [${a}]` : '';
  };
  lines.push(
    `Diseases (${g.disease.length}): ${list(g.disease.map((d: Disease) => `${d.name}${withStage(d)}`))}`
  );
  lines.push(
    `Medicines (${g.medicine.length}): ${list(
      g.medicine.map((m: Medicine) => `${m.name}${m.className ? ` (${m.className})` : ''}${withStage(m)}`)
    )}`
  );
  lines.push(
    `Investigations (${g.investigation.length}): ${list(g.investigation.map((i: Investigation) => `${i.name}${withStage(i)}`))}`
  );

  // --- Learning notes ---
  if (g.lesson.length) {
    lines.push('');
    lines.push(`=== LEARNING NOTES (${g.lesson.length}) ===`);
    for (const l of g.lesson.slice(0, limit) as Lesson[]) {
      lines.push(`- ${l.date}${withStage(l)} ${l.title}: ${String(l.content ?? '').slice(0, 220)}`);
    }
  }

  // --- Questions ---
  if (g.question.length) {
    lines.push('');
    lines.push(`=== QUESTIONS (${g.question.length}) ===`);
    for (const q of g.question.slice(0, limit) as Question[]) {
      lines.push(`- [${q.status}] ${q.text}${q.answer ? ` — my answer: ${q.answer.slice(0, 160)}` : ''}${withStage(q)}`);
    }
  }

  // --- Clinical days ---
  if (s.days.length) {
    lines.push('');
    lines.push(`=== CLINICAL DAYS (${s.days.length}) ===`);
    for (const d of s.days.slice(0, 10)) {
      const bits = [
        d.conditions?.length ? `conditions: ${d.conditions.join(', ')}` : '',
        d.medicines?.length ? `medicines: ${d.medicines.join(', ')}` : '',
        d.investigations?.length ? `investigations: ${d.investigations.join(', ')}` : '',
        d.lessons?.length ? `lessons: ${d.lessons.join(' | ')}` : '',
      ].filter(Boolean);
      if (bits.length) lines.push(`- Day ${d.dayNumber} (${d.date}): ${bits.join('; ')}`);
    }
  }

  // --- Ward rounds ---
  if (s.wardRounds.length) {
    lines.push('');
    lines.push(`=== WARD ROUNDS (${s.wardRounds.length}) ===`);
    for (const r of s.wardRounds.slice(0, 10)) {
      const entries = s.wardEntries.filter((e) => e.roundId === r.id);
      const summary = entries
        .slice(0, 12)
        .map((e) => `${e.title || ''}${e.title && e.content ? ' — ' : ''}${String(e.content ?? '').slice(0, 90)}`)
        .filter(Boolean)
        .join(' | ');
      const stageName = getStage(r.academic?.stageId)?.name;
      lines.push(
        `- ${r.date} ${r.ward}${r.focus ? ` (${r.focus})` : ''}${stageName ? ` [${stageName}]` : ''}: ${entries.length} capture(s)${summary ? ` — ${summary}` : ''}`
      );
    }
  }

  // --- Revision / SRS ---
  if (s.revisions.length) {
    const due = s.revisions.filter((r) => (r.nextReview ?? 0) <= now);
    const weak = s.revisions.filter((r) => ((r as any).confidence ?? 3) <= 2);
    lines.push('');
    lines.push(`=== REVISION (${s.revisions.length} items, ${due.length} due) ===`);
    lines.push(`Due now: ${list(due.map((r) => r.topic), 15)}`);
    if (weak.length) lines.push(`Low confidence / weak areas: ${list(weak.map((r) => r.topic), 15)}`);
  }

  // --- Quizzes ---
  if (s.quizzes.length) {
    lines.push('');
    lines.push(`=== QUIZ HISTORY (${s.quizzes.length}) ===`);
    for (const q of s.quizzes.slice(0, 6)) {
      lines.push(`- ${q.date} ${q.title}: scored ${q.score}/${q.total}`);
    }
  }

  // --- Bundles ---
  if (s.bundles.length) {
    lines.push('');
    lines.push(`=== BUNDLES (${s.bundles.length}) ===`);
    for (const b of s.bundles.slice(0, 6)) {
      lines.push(`- ${b.title} (${b.periodStart}→${b.periodEnd})`);
    }
  }

  // --- Community pharmacy workstation ---
  if (s.cpEncounters.length || s.cpDrugCards.length || s.cpScenarios.length) {
    lines.push('');
    lines.push(`=== COMMUNITY PHARMACY ===`);
    lines.push(`Encounters: ${s.cpEncounters.length} · Drug cards: ${s.cpDrugCards.length} · Scenarios: ${s.cpScenarios.length}`);
    if (s.cpEncounters.length) {
      const recent = [...s.cpEncounters].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
      for (const e of recent) {
        const bits = [
          e.encounterType,
          e.symptoms?.length ? `symptoms: ${e.symptoms.join(', ')}` : '',
          e.recommendedProduct ? `product: ${e.recommendedProduct}` : '',
          `action: ${e.actionTaken}`,
          e.redFlags?.length ? `RED FLAGS: ${e.redFlags.join(', ')}` : '',
        ].filter(Boolean);
        lines.push(`- ${e.date} "${e.title}": ${bits.join('; ')}`);
      }
    }
    if (s.cpDrugCards.length) {
      lines.push(`Drugs studied: ${s.cpDrugCards.slice(0, 20).map((d) => `${d.genericName}(${d.confidence ?? '?'}/5)`).join('; ')}`);
    }
  }

  // --- Tags & favourites ---
  const tags = allTags().slice(0, 20);
  if (tags.length) {
    lines.push('');
    lines.push(`Tags in use: ${tags.map((t) => `#${t.tag}(${t.count})`).join(' ')}`);
  }
  const favs = favorites().slice(0, 12);
  if (favs.length) lines.push(`Starred: ${favs.map((f) => f.title).join('; ')}`);

  return lines.join('\n');
}

/**
 * Compact stats line — cheap enough to include in every prompt even when the
 * full context is too large.
 */
export function unifiedSummaryLine(): string {
  const s = useData.getState();
  const st = learningStats();
  return [
    `${s.academicStages.length} academic stage(s)`,
    `${s.courses.length} course(s)`,
    `${s.days.length} clinical day(s)`,
    `${s.wardRounds.length} ward round(s)`,
    `${st.diseases} disease(s)`,
    `${st.medicines} medicine(s)`,
    `${st.investigations} investigation(s)`,
    `${st.lessons} learning note(s)`,
    `${st.questions} question(s) (${st.openQuestions} open)`,
    `${st.revision} revision item(s) (${st.dueRevision} due)`,
    `${s.quizzes.length} quiz(zes)`,
    `${s.bundles.length} bundle(s)`,
  ].join(' · ');
}
