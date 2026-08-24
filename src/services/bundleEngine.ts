import { useData, uid } from '../stores/data';
import { emptyBundle, todayIso } from './defaults';
import { getStage } from './academic';
import { retrieveKnowledge, type KnowledgeRecord, type RetrieveOptions } from './intelligence';
import { monthBounds, weekBounds } from './wardRounds';
import type { Bundle, BundleSnapshotItem, BundleType } from '../types';

/**
 * 📦 CLINICAL Rx BUNDLER ENGINE (Phase 4)
 *
 * Architecture (per spec §49):
 *
 *   APPLICATION DATA → INTELLIGENCE LAYER → BUNDLE SELECTION
 *     → SNAPSHOT GENERATOR → INDEPENDENT BUNDLE → BUNDLE VAULT
 *
 * The defining rule: **a bundle is an immutable snapshot, not a live query.**
 * Once generated it freezes copies of the records it included. Editing or
 * deleting a source record later never changes an existing bundle.
 *
 * The engine never touches database tables directly — it asks the Intelligence
 * Layer for activity, so any module that registers a KnowledgeSource is
 * automatically bundle-able without changing this file.
 *
 * Fully offline. AI enhancement arrives in Phase 5; summaries here are
 * deterministic and built from stored data only.
 */

// ---- Selection ---------------------------------------------------------

export interface BundleSelection {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  /** Intelligence Layer source keys; empty = every source. */
  modules?: string[];
  stageId?: string;
  academicLevel?: string;
  courseId?: string;
  tag?: string;
  /** Explicit record ids to include (overrides the date sweep). */
  recordIds?: string[];
  query?: string;
}

/** Sources that represent real learning activity (excludes bundles themselves). */
export const BUNDLE_SOURCE_KEYS = [
  'wardRound',
  'wardEntry',
  'lesson',
  'disease',
  'medicine',
  'investigation',
  'question',
  'revision',
  'day',
  'quiz',
  'course',
];

export const MODULE_LABELS: Record<string, string> = {
  wardRound: 'Ward Rounds',
  wardEntry: 'Ward Captures',
  lesson: 'Learning Notes',
  disease: 'Diseases',
  medicine: 'Medicines',
  investigation: 'Investigations',
  question: 'Questions',
  revision: 'Revision',
  day: 'Clinical Days',
  quiz: 'Quizzes',
  course: 'Courses',
};

/**
 * Ask the Intelligence Layer for everything matching a selection.
 * This is the ONLY way the bundler reads application data.
 */
export function collectSelection(sel: BundleSelection): KnowledgeRecord[] {
  const opts: RetrieveOptions = {
    query: sel.query,
    modules: sel.modules?.length ? sel.modules : BUNDLE_SOURCE_KEYS,
    dateRange: { from: sel.from, to: sel.to },
    stageId: sel.stageId,
    academicLevel: sel.academicLevel,
    courseId: sel.courseId,
    tag: sel.tag,
    limit: 2000, // generous: a bundle may legitimately be large
    includeRelationships: false,
  };
  let records = retrieveKnowledge(opts).records;
  if (sel.recordIds?.length) {
    const wanted = new Set(sel.recordIds);
    records = records.filter((r) => wanted.has(r.id));
  }
  return records;
}

export interface BundlePreview {
  total: number;
  counts: Record<string, number>;
  records: KnowledgeRecord[];
  from: string;
  to: string;
}

/** Preview what a bundle WOULD contain, without creating anything. */
export function previewBundle(sel: BundleSelection): BundlePreview {
  const records = collectSelection(sel);
  const counts: Record<string, number> = {};
  for (const r of records) {
    const key = MODULE_LABELS[String(r.module)] ?? String(r.module);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { total: records.length, counts, records, from: sel.from, to: sel.to };
}

// ---- Snapshot generator -----------------------------------------------

function toSnapshotItem(r: KnowledgeRecord): BundleSnapshotItem {
  return {
    sourceId: r.id,
    sourceType: String(r.module),
    title: r.title,
    summary: r.summary,
    date: r.date,
    academicLabel: r.academicLabel,
    tags: r.tags,
  };
}

/** Deterministic, non-AI summary built purely from the frozen snapshot. */
function buildSummary(items: BundleSnapshotItem[], from: string, to: string): string {
  if (!items.length) return 'No activity recorded in this period.';
  const by = (t: string) => items.filter((i) => i.sourceType === t);
  const names = (t: string, n = 8) =>
    Array.from(new Set(by(t).map((i) => i.title)))
      .slice(0, n)
      .join(', ');
  const lines: string[] = [];
  lines.push(from === to ? `Activity recorded on ${from}.` : `Activity recorded from ${from} to ${to}.`);
  if (by('wardRound').length) lines.push(`Ward rounds: ${names('wardRound')}.`);
  if (by('disease').length) lines.push(`Conditions: ${names('disease')}.`);
  if (by('medicine').length) lines.push(`Medicines: ${names('medicine')}.`);
  if (by('investigation').length) lines.push(`Investigations: ${names('investigation')}.`);
  if (by('lesson').length) lines.push(`Learning points captured: ${by('lesson').length}.`);
  if (by('question').length) lines.push(`Questions raised: ${by('question').length}.`);
  return lines.join('\n');
}

/** Recurring subjects across the snapshot — the deterministic "key themes". */
function keyThemes(items: BundleSnapshotItem[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (!['disease', 'medicine', 'investigation'].includes(i.sourceType)) continue;
    const k = i.title.trim();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const i of items) {
    for (const t of i.tags ?? []) counts.set('#' + t, (counts.get('#' + t) ?? 0) + 2);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);
}

/** Follow-up items: unanswered questions frozen into the snapshot. */
function followUpItems(items: BundleSnapshotItem[]): string[] {
  return items
    .filter((i) => i.sourceType === 'question')
    .filter((i) => !/^Status: answered/i.test(i.summary) && !/answered/i.test(i.summary.slice(0, 20)))
    .map((i) => i.title)
    .slice(0, 12);
}

function statsFrom(items: BundleSnapshotItem[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const i of items) {
    const label = MODULE_LABELS[i.sourceType] ?? i.sourceType;
    stats[label] = (stats[label] ?? 0) + 1;
  }
  stats['Total records'] = items.length;
  return stats;
}

export interface GenerateInput {
  type: BundleType;
  title: string;
  selection: BundleSelection;
  creationMethod: Bundle['creationMethod'];
  autoKey?: string;
  notes?: string;
}

/**
 * Generate an INDEPENDENT bundle snapshot.
 *
 * Every call produces a brand-new bundle with its own id. Existing bundles are
 * never located, mutated or overwritten — that is what makes historical
 * bundles trustworthy.
 */
export async function generateSnapshot(input: GenerateInput): Promise<Bundle> {
  const st = useData.getState();
  const { selection } = input;

  const bundle = emptyBundle(input.type, input.title, selection.from, selection.to);
  bundle.creationMethod = input.creationMethod;
  bundle.status = 'generating';
  bundle.autoKey = input.autoKey;
  bundle.notes = input.notes;

  try {
    const records = collectSelection(selection);
    const items = records.map(toSnapshotItem);

    bundle.snapshot = items;
    bundle.sourceIds = items.map((i) => i.sourceId);
    bundle.stats = statsFrom(items);
    bundle.summary = buildSummary(items, selection.from, selection.to);
    bundle.highlights = keyThemes(items);
    bundle.knowledgeGaps = followUpItems(items);
    bundle.recommendedRevision = Array.from(new Set(items.filter((i) => i.sourceType === 'revision').map((i) => i.title))).slice(0, 8);
    bundle.includedModules = selection.modules?.length ? selection.modules : undefined;
    bundle.body = {
      selection,
      // Grouped view for the bundle viewer — part of the frozen snapshot.
      groups: items.reduce<Record<string, BundleSnapshotItem[]>>((acc, i) => {
        (acc[i.sourceType] ??= []).push(i);
        return acc;
      }, {}),
    };
    bundle.status = 'completed';
    bundle.generatedAt = Date.now();
  } catch (e: any) {
    // Never store a corrupt bundle — record the failure so it can be retried.
    bundle.status = 'failed';
    bundle.error = e?.message ?? 'Bundle generation failed';
    bundle.snapshot = [];
  }

  // Academic context is stamped by the store on save and never rewritten
  // afterwards. Re-read the stored record so the caller gets the stamped copy.
  await st.save('bundle', bundle);
  return useData.getState().bundles.find((b) => b.id === bundle.id) ?? bundle;
}

// ---- Automatic generation ---------------------------------------------

function isoAddDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyKey(date: string): string {
  return `auto-daily:${date}`;
}

export function weeklyKey(mondayIso: string): string {
  return `auto-weekly:${mondayIso}`;
}

/** Duplicate guard — deterministic key, checked before any generation. */
export function autoBundleExists(key: string): boolean {
  return useData.getState().bundles.some((b) => b.autoKey === key);
}

// In-memory guard so concurrent triggers can't race into duplicates.
const inFlight = new Set<string>();

async function generateAuto(key: string, type: BundleType, title: string, from: string, to: string): Promise<Bundle | null> {
  if (autoBundleExists(key) || inFlight.has(key)) return null;
  inFlight.add(key);
  try {
    const bundle = await generateSnapshot({
      type,
      title,
      selection: { from, to },
      creationMethod: 'automatic',
      autoKey: key,
    });
    return bundle;
  } finally {
    inFlight.delete(key);
  }
}

/** Dates that have any activity, used to decide what is worth bundling. */
function datesWithActivity(): string[] {
  const records = retrieveKnowledge({ modules: BUNDLE_SOURCE_KEYS, limit: 5000 }).records;
  return Array.from(new Set(records.map((r) => r.date).filter(Boolean))).sort();
}

export interface AutoRunResult {
  daily: number;
  weekly: number;
  skipped: number;
}

/**
 * Catch-up generation.
 *
 * Runs at startup (and on demand). Finds every COMPLETED day/week that has
 * activity but no automatic bundle and generates the missing ones — so
 * closing the app for a week loses nothing, and no midnight timer is needed.
 *
 * Today is deliberately skipped: the day isn't over yet.
 */
export async function runAutomaticBundling(now = new Date()): Promise<AutoRunResult> {
  const st = useData.getState();
  const settings = st.settings;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const result: AutoRunResult = { daily: 0, weekly: 0, skipped: 0 };

  const active = datesWithActivity().filter((d) => d < today); // completed days only

  if (settings?.autoDailyBundle !== false) {
    for (const date of active) {
      const key = dailyKey(date);
      if (autoBundleExists(key)) {
        result.skipped++;
        continue;
      }
      const b = await generateAuto(key, 'auto-daily', `Daily Bundle — ${date}`, date, date);
      if (b) result.daily++;
    }
  }

  if (settings?.autoWeeklyBundle !== false) {
    const weeks = new Map<string, { start: string; end: string }>();
    for (const date of active) {
      const w = weekBounds(date);
      // Only bundle weeks that have fully finished.
      if (w.end < today) weeks.set(w.start, w);
    }
    for (const w of weeks.values()) {
      const key = weeklyKey(w.start);
      if (autoBundleExists(key)) {
        result.skipped++;
        continue;
      }
      const b = await generateAuto(key, 'auto-weekly', `Weekly Bundle — ${w.start} → ${w.end}`, w.start, w.end);
      if (b) result.weekly++;
    }
  }

  if (result.daily || result.weekly) {
    useData
      .getState()
      .setStatus(`📦 Generated ${result.daily + result.weekly} automatic bundle(s)`);
  }
  return result;
}

/** Explicitly bundle today, even though the day isn't finished. */
export async function bundleToday(): Promise<Bundle> {
  const date = todayIso();
  return generateSnapshot({
    type: 'manual-day',
    title: `Day Bundle — ${date}`,
    selection: { from: date, to: date },
    creationMethod: 'manual',
  });
}

// ---- Manual bundling ---------------------------------------------------

export async function createDayBundle(date: string, title?: string): Promise<Bundle> {
  return generateSnapshot({
    type: 'manual-day',
    title: title?.trim() || `Day Bundle — ${date}`,
    selection: { from: date, to: date },
    creationMethod: 'manual',
  });
}

export async function createWeekBundle(anyDateInWeek: string, title?: string): Promise<Bundle> {
  const w = weekBounds(anyDateInWeek);
  return generateSnapshot({
    type: 'manual-week',
    title: title?.trim() || `Week Bundle — ${w.start} → ${w.end}`,
    selection: { from: w.start, to: w.end },
    creationMethod: 'manual',
  });
}

export async function createCustomBundle(selection: BundleSelection, title: string, notes?: string): Promise<Bundle> {
  return generateSnapshot({
    type: 'manual-custom',
    title: title.trim() || `Custom Bundle — ${selection.from} → ${selection.to}`,
    selection,
    creationMethod: 'manual',
    notes,
  });
}

export function currentMonthRange(): { from: string; to: string } {
  const m = monthBounds(todayIso());
  return { from: m.start, to: m.end };
}

// ---- Merging -----------------------------------------------------------

export interface MergePreview {
  bundles: Bundle[];
  uniqueRecords: number;
  duplicates: number;
  total: number;
  from: string;
  to: string;
}

/** Preview a merge, including duplicate detection across source bundles. */
export function previewMerge(bundleIds: string[]): MergePreview {
  const all = useData.getState().bundles.filter((b) => bundleIds.includes(b.id));
  const seen = new Set<string>();
  let duplicates = 0;
  let total = 0;
  for (const b of all) {
    for (const item of b.snapshot ?? []) {
      total++;
      const key = `${item.sourceType}:${item.sourceId}`;
      if (seen.has(key)) duplicates++;
      else seen.add(key);
    }
  }
  const starts = all.map((b) => b.periodStart).filter(Boolean).sort();
  const ends = all.map((b) => b.periodEnd).filter(Boolean).sort();
  return {
    bundles: all,
    uniqueRecords: seen.size,
    duplicates,
    total,
    from: starts[0] ?? '',
    to: ends[ends.length - 1] ?? '',
  };
}

/**
 * Merge bundles into a NEW independent snapshot.
 *
 * Originals are never modified or deleted, and the merged bundle keeps its own
 * frozen copy of the combined records — so deleting a source bundle later
 * leaves the merged one fully intact.
 */
export async function mergeBundles(bundleIds: string[], title: string, notes?: string): Promise<Bundle | null> {
  const st = useData.getState();
  const sources = st.bundles.filter((b) => bundleIds.includes(b.id));
  if (!sources.length) return null;

  // De-duplicate by source record — the same note in two dailies appears once.
  const merged = new Map<string, BundleSnapshotItem>();
  let duplicates = 0;
  for (const b of sources) {
    for (const item of b.snapshot ?? []) {
      const key = `${item.sourceType}:${item.sourceId}`;
      if (merged.has(key)) duplicates++;
      else merged.set(key, item);
    }
  }
  const items = Array.from(merged.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

  const starts = sources.map((b) => b.periodStart).filter(Boolean).sort();
  const ends = sources.map((b) => b.periodEnd).filter(Boolean).sort();
  const from = starts[0] ?? todayIso();
  const to = ends[ends.length - 1] ?? todayIso();

  const bundle = emptyBundle('merged', title.trim() || `Merged Bundle — ${from} → ${to}`, from, to);
  bundle.creationMethod = 'merge';
  bundle.status = 'completed';
  bundle.generatedAt = Date.now();
  bundle.notes = notes;
  bundle.snapshot = items;
  bundle.sourceIds = items.map((i) => i.sourceId);
  bundle.sourceBundleIds = sources.map((b) => b.id);
  bundle.stats = { ...statsFrom(items), 'Merged bundles': sources.length, 'Duplicates removed': duplicates };
  bundle.summary = [
    `Merged snapshot combining ${sources.length} bundle(s): ${sources.map((b) => b.title).join('; ')}.`,
    buildSummary(items, from, to),
  ].join('\n');
  bundle.highlights = keyThemes(items);
  bundle.knowledgeGaps = followUpItems(items);
  bundle.body = {
    mergedFrom: sources.map((b) => ({ id: b.id, title: b.title, type: b.type })),
    duplicatesRemoved: duplicates,
    groups: items.reduce<Record<string, BundleSnapshotItem[]>>((acc, i) => {
      (acc[i.sourceType] ??= []).push(i);
      return acc;
    }, {}),
  };

  await st.save('bundle', bundle);
  return useData.getState().bundles.find((b) => b.id === bundle.id) ?? bundle;
}

// ---- Vault: search / filter / actions ----------------------------------

export interface BundleFilter {
  kind?: 'all' | 'automatic' | 'manual' | 'merged';
  type?: BundleType | 'all';
  query?: string;
  from?: string;
  to?: string;
  stageId?: string;
  favorite?: boolean;
  tag?: string;
}

/** Offline search across bundle metadata AND their frozen contents. */
export function searchBundles(filter: BundleFilter = {}): Bundle[] {
  const q = (filter.query ?? '').trim().toLowerCase();
  return useData
    .getState()
    .bundles.filter((b) => {
      if (filter.kind === 'automatic' && b.creationMethod !== 'automatic' && !b.type.startsWith('auto')) return false;
      if (filter.kind === 'manual' && !(b.creationMethod === 'manual' || b.type.startsWith('manual'))) return false;
      if (filter.kind === 'merged' && b.type !== 'merged') return false;
      if (filter.type && filter.type !== 'all' && b.type !== filter.type) return false;
      if (filter.favorite && !b.favorite) return false;
      if (filter.stageId && b.academic?.stageId !== filter.stageId) return false;
      if (filter.tag && !(b.tags ?? []).includes(filter.tag)) return false;
      if (filter.from && b.periodEnd < filter.from) return false;
      if (filter.to && b.periodStart > filter.to) return false;
      if (q) {
        const hay = [
          b.title,
          b.summary,
          b.notes ?? '',
          ...(b.highlights ?? []),
          ...(b.snapshot ?? []).map((i) => `${i.title} ${i.summary}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.periodStart === b.periodStart ? b.createdAt - a.createdAt : a.periodStart < b.periodStart ? 1 : -1));
}

export async function toggleBundleFavorite(id: string): Promise<void> {
  const st = useData.getState();
  const b = st.bundles.find((x) => x.id === id);
  if (!b) return;
  await st.save('bundle', { ...b, favorite: !b.favorite });
}

export async function renameBundle(id: string, title: string): Promise<void> {
  const st = useData.getState();
  const b = st.bundles.find((x) => x.id === id);
  if (!b || !title.trim()) return;
  await st.save('bundle', { ...b, title: title.trim() });
}

export async function setBundleNotes(id: string, notes: string): Promise<void> {
  const st = useData.getState();
  const b = st.bundles.find((x) => x.id === id);
  if (!b) return;
  await st.save('bundle', { ...b, notes });
}

/**
 * Delete a bundle snapshot. Source records are NEVER touched, and merged
 * bundles built from it remain intact because they hold their own copy.
 */
export async function deleteBundle(id: string): Promise<void> {
  await useData.getState().remove('bundle', id);
  useData.getState().setStatus('✓ Bundle deleted — your clinical records were not touched');
}

/** Does the original record behind a snapshot item still exist? */
export function sourceExists(item: BundleSnapshotItem): boolean {
  const st = useData.getState();
  const map: Record<string, any[]> = {
    lesson: st.lessons,
    disease: st.diseases,
    medicine: st.medicines,
    investigation: st.investigations,
    question: st.questions,
    revision: st.revisions,
    day: st.days,
    wardRound: st.wardRounds,
    wardEntry: st.wardEntries,
    quiz: st.quizzes,
    course: st.courses,
  };
  const list = map[item.sourceType];
  if (!list) return false;
  return list.some((r: any) => r.id === item.sourceId);
}

/** Route to open the original record behind a snapshot item. */
export function sourceRoute(item: BundleSnapshotItem): string {
  const routes: Record<string, string> = {
    lesson: '/notes',
    disease: '/diseases',
    medicine: '/medicines',
    investigation: '/investigations',
    question: '/questions',
    revision: '/revision',
    day: '/clinical',
    wardRound: `/ward-rounds?round=${item.sourceId}`,
    wardEntry: '/ward-rounds',
    quiz: '/quiz',
    course: '/courses',
  };
  return routes[item.sourceType] ?? '/bundles';
}

// ---- Export (from the snapshot, never from live data) ------------------

export function bundleToMarkdownSnapshot(b: Bundle): string {
  const lines: string[] = [];
  lines.push(`# ${b.title}`);
  lines.push('');
  lines.push(`**Type:** ${b.type}  `);
  lines.push(`**Period:** ${b.periodStart} → ${b.periodEnd}  `);
  if (b.academic) {
    const stage = getStage(b.academic.stageId);
    if (stage) lines.push(`**Academic context:** ${stage.name} · ${stage.academicYear}  `);
  }
  lines.push(`**Created:** ${new Date(b.createdAt).toLocaleString()}  `);
  lines.push(`**Records in snapshot:** ${b.snapshot?.length ?? 0}`);
  lines.push('');
  if (b.notes) {
    lines.push('## My notes');
    lines.push('');
    lines.push(b.notes);
    lines.push('');
  }
  lines.push('## Summary');
  lines.push('');
  lines.push(b.summary || '_No summary._');
  lines.push('');
  if (b.highlights?.length) {
    lines.push('## Key themes');
    lines.push('');
    b.highlights.forEach((h) => lines.push(`- ${h}`));
    lines.push('');
  }
  if (b.knowledgeGaps?.length) {
    lines.push('## Follow-up');
    lines.push('');
    b.knowledgeGaps.forEach((g) => lines.push(`- ${g}`));
    lines.push('');
  }
  const groups = (b.body as any)?.groups as Record<string, BundleSnapshotItem[]> | undefined;
  if (groups) {
    for (const [type, items] of Object.entries(groups)) {
      lines.push(`## ${MODULE_LABELS[type] ?? type} (${items.length})`);
      lines.push('');
      for (const i of items) {
        lines.push(`- **${i.title}**${i.date ? ` _(${i.date})_` : ''}${i.summary ? ` — ${i.summary}` : ''}`);
      }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');
  lines.push('_Snapshot exported from CLINICAL Rx. Content reflects the records as they were when the bundle was created._');
  return lines.join('\n');
}

export function bundleToJsonSnapshot(b: Bundle): string {
  return JSON.stringify(
    {
      id: b.id,
      title: b.title,
      type: b.type,
      creationMethod: b.creationMethod,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      academic: b.academic,
      createdAt: b.createdAt,
      generatedAt: b.generatedAt,
      status: b.status,
      notes: b.notes,
      summary: b.summary,
      highlights: b.highlights,
      followUp: b.knowledgeGaps,
      stats: b.stats,
      sourceBundleIds: b.sourceBundleIds,
      snapshot: b.snapshot,
    },
    null,
    2
  );
}

/** Placeholder marker for Phase 5 AI enhancement of a snapshot. */
export function aiEnhancementAvailable(): boolean {
  return false; // Phase 5
}
