import { useData } from '../stores/data';
import type { Bundle, BundleCreateInput, ClinicalDay, Disease, Medicine, Investigation, Question, WardRound } from '../types';
import { emptyBundle, todayIso } from './defaults';
import { aiChat } from './ai';
import { getEffectiveAiConfig } from './aiTools';
import { digestRound, roundsInRange, type WardRoundDigest } from './wardRounds';

interface Context {
  days: ClinicalDay[];
  diseases: Disease[];
  medicines: Medicine[];
  investigations: Investigation[];
  questions: Question[];
  wardRounds: WardRound[];
  wardDigests: WardRoundDigest[];
}

function collectContext(start: string, end: string, sourceModules?: BundleCreateInput['sourceModules']): Context {
  const s = useData.getState();
  const inRange = (date?: string) => !date || (date >= start && date <= end);
  const startT = new Date(start + 'T00:00:00').getTime();
  const endT = new Date(end + 'T23:59:59.999').getTime();
  const inTimeRange = (t: number) => t >= startT && t <= endT;

  const days = (sourceModules?.includes('day') ?? true) ? s.days.filter((d) => inRange(d.date)) : [];
  const diseases = (sourceModules?.includes('disease') ?? true)
    ? s.diseases.filter((d) => inRange(d.lastSeen)).slice(0, 40)
    : [];
  const medicines = (sourceModules?.includes('medicine') ?? true)
    ? s.medicines.filter((m) => inRange(m.lastSeen)).slice(0, 40)
    : [];
  const investigations = (sourceModules?.includes('investigation') ?? true)
    ? s.investigations.filter((i) => inRange(i.lastSeen)).slice(0, 40)
    : [];
  const questions = (sourceModules?.includes('question') ?? true) ? s.questions.filter((q) => inTimeRange(q.createdAt)) : [];
  // Ward rounds are first-class bundle sources. We keep the ROUND records and
  // a compact digest; the bundle references rounds by id rather than copying
  // their entries, so the original ward round stays the single source of truth.
  const wardRounds = (sourceModules?.includes('wardRound') ?? true) ? roundsInRange(start, end) : [];
  const wardDigests = wardRounds.map(digestRound);

  return { days, diseases, medicines, investigations, questions, wardRounds, wardDigests };
}

function statsFor(ctx: Context): Record<string, number> {
  return {
    'Clinical days': ctx.days.length,
    'Conditions': ctx.diseases.length,
    'Medicines': ctx.medicines.length,
    'Investigations': ctx.investigations.length,
    'Questions': ctx.questions.length,
    'Open questions': ctx.questions.filter((q) => q.status === 'open').length,
    'Ward rounds': ctx.wardRounds.length,
    'Ward captures': ctx.wardDigests.reduce((n, d) => n + d.counts.total, 0),
  };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

function buildBody(ctx: Context): Record<string, unknown> {
  const w = ctx.wardDigests;
  const conditions = dedupe(
    ctx.days.flatMap((d) => d.conditions).concat(ctx.diseases.map((d) => d.name)).concat(w.flatMap((r) => r.conditions))
  );
  const meds = dedupe(
    ctx.days.flatMap((d) => d.medicines).concat(ctx.medicines.map((m) => m.name)).concat(w.flatMap((r) => r.medicines))
  );
  const labs = dedupe(
    ctx.days.flatMap((d) => d.investigations).concat(ctx.investigations.map((i) => i.name)).concat(w.flatMap((r) => r.investigations))
  );
  const lessons = dedupe(ctx.days.flatMap((d) => d.lessons).concat(w.flatMap((r) => r.learning)));
  const uncertainties = dedupe(ctx.days.flatMap((d) => d.uncertainties));
  const topics = dedupe(ctx.days.flatMap((d) => d.topicsToResearch));

  return {
    conditions,
    medicines: meds,
    investigations: labs,
    lessons,
    uncertainties,
    topics,
    // Reference the rounds (id + digest) instead of duplicating their entries.
    wardRounds: w.map((r) => ({ id: r.id, ward: r.ward, date: r.date, focus: r.focus, counts: r.counts })),
    wardLearning: w.flatMap((r) => r.learning),
    wardQuestions: w.flatMap((r) => r.questions),
    wardNotes: w.flatMap((r) => r.notes),
    questions: ctx.questions.map((q) => ({ text: q.text, priority: q.priority, status: q.status, category: q.category })),
    diseases: ctx.diseases.map((d) => ({ name: d.name, encounters: d.encounters })),
    medicinesDetail: ctx.medicines.map((m) => ({ name: m.name, className: m.className, encounters: m.encounters })),
  };
}

function localSummary(body: Record<string, unknown>): string {
  const b = body as any;
  const lines: string[] = [];
  if (b.conditions?.length) lines.push(`Conditions encountered: ${b.conditions.join(', ')}.`);
  if (b.medicines?.length) lines.push(`Medicines encountered: ${b.medicines.join(', ')}.`);
  if (b.investigations?.length) lines.push(`Investigations: ${b.investigations.join(', ')}.`);
  if (b.lessons?.length) lines.push(`Key lessons: ${b.lessons.join(' · ')}.`);
  if (b.wardRounds?.length) {
    // `counts` is absent when the body was built from a subset of entries.
    const wr = b.wardRounds as Array<{ ward: string; date: string; counts?: { total: number } }>;
    lines.push(
      `Ward rounds: ${wr
        .map((r) => `${r.ward} (${r.date}${typeof r.counts?.total === 'number' ? `, ${r.counts.total} captures` : ''})`)
        .join('; ')}.`
    );
  }
  if (!lines.length) lines.push('No clinical activity recorded in this period.');
  return lines.join('\n');
}

function localGaps(ctx: Context): string[] {
  const gaps = new Set<string>();
  for (const d of ctx.days) for (const u of d.uncertainties) if (u.trim()) gaps.add(u.trim());
  for (const q of ctx.questions) if (q.status === 'open' && q.text.trim()) gaps.add(q.text.trim());
  // Open questions captured during a ward round are knowledge gaps too.
  for (const r of ctx.wardDigests) for (const q of r.questions) if (q.trim()) gaps.add(q.trim());
  return Array.from(gaps).slice(0, 10);
}

function localHighlights(ctx: Context): string[] {
  const counts = new Map<string, number>();
  for (const m of ctx.medicines) counts.set(m.name, (counts.get(m.name) ?? 0) + m.encounters);
  for (const m of ctx.days.flatMap((d) => d.medicines)) counts.set(m, (counts.get(m) ?? 0) + 1);
  for (const r of ctx.wardDigests) for (const m of r.medicines) counts.set(m, (counts.get(m) ?? 0) + 1);
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return top.map(([name, n]) => `${name} (${n}x)`);
}

export interface EnrichResult {
  bundle: Bundle;
  succeeded: boolean;
  reason?: string;
}

export function aiAvailable(): boolean {
  // Use the effective config (own key first, then borrow from any section).
  const cfg = getEffectiveAiConfig('bundler');
  return !!cfg?.enabled && !!cfg?.apiKey;
}

async function enrichWithAi(bundle: Bundle, _ctx: Context): Promise<EnrichResult> {
  const cfg = getEffectiveAiConfig('bundler');
  if (!cfg?.enabled || !cfg.apiKey) {
    return { bundle, succeeded: false, reason: 'no-config' };
  }

  const prompt = [
    `You are CLINICAL Rx, a clinical learning assistant for a Level 200 Pharmacy student.`,
    `Produce a concise daily/weekly clinical learning summary from the data below.`,
    `Return a clear summary, then "KNOWLEDGE GAPS:" list, then "RECOMMENDED REVISION:" list, then "HIGHLIGHTS:" list.`,
    `DATA:`,
    JSON.stringify(bundle.body),
  ].join('\n');

  const res = await aiChat(cfg, 'You write concise clinical learning summaries for pharmacy students.', prompt);
  if (!res.ok) {
    return { bundle, succeeded: false, reason: 'offline-or-error' };
  }

  const t = res.text;
  const pick = (label: string) =>
    (t.split(label)[1]?.split('\n').slice(1).filter((l) => l.trim().startsWith('-') || /^\d+[.)]/.test(l.trim())).map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean)) || [];
  const enriched = { ...bundle, summary: t, aiModel: cfg.model, aiPending: false };
  const gaps = pick('KNOWLEDGE GAPS').length ? pick('KNOWLEDGE GAPS') : bundle.knowledgeGaps;
  const rev = pick('RECOMMENDED REVISION').length ? pick('RECOMMENDED REVISION') : bundle.recommendedRevision;
  return { bundle: { ...enriched, knowledgeGaps: gaps, recommendedRevision: rev }, succeeded: true };
}

/** Mark a bundle as awaiting AI enrichment (used when created offline). */
export async function queueAiPending(bundleId: string) {
  const s = useData.getState();
  if (!s.settings) return;
  const list = Array.from(new Set([...(s.settings.aiPendingBundles ?? []), bundleId]));
  await s.saveSettings({ ...s.settings, updatedAt: Date.now(), aiPendingBundles: list });
}

/** Re-process every pending bundle with AI (run once you're back online). */
let aiQueueRunning = false;
export async function processAiQueue(): Promise<{ processed: number; failed: number }> {
  // Re-entrancy guard: never run two AI-queue passes at once (e.g. from app
  // startup and the browser 'online' event), so the bundler AI can't block
  // or duplicate work with other AI sections.
  if (aiQueueRunning) return { processed: 0, failed: 0 };
  aiQueueRunning = true;
  try {
    return await processAiQueueInner();
  } finally {
    aiQueueRunning = false;
  }
}

async function processAiQueueInner(): Promise<{ processed: number; failed: number }> {
  const s = useData.getState();
  const settings = s.settings;
  if (!settings || !settings.aiPendingBundles?.length) return { processed: 0, failed: 0 };
  if (!aiAvailable()) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  const remaining: string[] = [];
  for (const id of settings.aiPendingBundles) {
    const bundle = s.bundles.find((b) => b.id === id);
    if (!bundle) continue;
    const ctx = collectContext(bundle.periodStart, bundle.periodEnd);
    const { bundle: enriched, succeeded } = await enrichWithAi(bundle, ctx);
    if (succeeded) {
      await s.save('bundle', enriched);
      processed++;
    } else {
      remaining.push(id);
      failed++;
    }
  }

  const next = useData.getState().settings;
  if (next) {
    await useData.getState().saveSettings({ ...next, updatedAt: Date.now(), aiPendingBundles: remaining });
  }
  return { processed, failed };
}

export function getPendingAiCount(): number {
  return useData.getState().settings?.aiPendingBundles?.length ?? 0;
}

export async function generateBundle(input: BundleCreateInput): Promise<Bundle> {
  const start = input.periodStart || todayIso();
  const end = input.periodEnd || todayIso();
  const st = useData.getState();

  // ONE bundle per day/week: if a bundle already exists for this exact period
  // (same day or same week), SIP the fresh data into it instead of creating a
  // duplicate. Keeps the library tidy: one card per day, one per week.
  const existing = st.bundles.find(
    (b) => b.periodStart === start && b.periodEnd === end && b.type === input.type
  );
  if (existing) {
    const ctx = collectContext(start, end, input.sourceModules);
    const updated: Bundle = {
      ...existing,
      title: existing.title,
      body: buildBody(ctx),
      stats: statsFor(ctx),
      knowledgeGaps: localGaps(ctx),
      recommendedRevision: (buildBody(ctx) as any).topics?.length ? (buildBody(ctx) as any).topics.slice(0, 6) : [],
      highlights: localHighlights(ctx),
      summary: localSummary(buildBody(ctx)),
      sourceIds: [...ctx.days, ...ctx.diseases, ...ctx.medicines, ...ctx.investigations, ...ctx.questions, ...ctx.wardRounds].map((r) => r.id),
      version: (existing.version ?? 1) + 1,
      updatedAt: Date.now(),
    };
    const enriched = await generateBundleWithAi(updated, ctx);
    await st.save('bundle', enriched);
    return enriched;
  }

  const bundle = emptyBundle(input.type, input.title, start, end);
  const ctx = collectContext(start, end, input.sourceModules);

  bundle.body = buildBody(ctx);
  bundle.stats = statsFor(ctx);
  bundle.knowledgeGaps = localGaps(ctx);
  bundle.recommendedRevision = (bundle.body as any).topics?.length
    ? (bundle.body as any).topics.slice(0, 6)
    : [];
  bundle.highlights = localHighlights(ctx);
  bundle.summary = localSummary(bundle.body);
  bundle.sourceBundleIds = input.sourceBundleIds ?? [];
  bundle.sourceIds = [...ctx.days, ...ctx.diseases, ...ctx.medicines, ...ctx.investigations, ...ctx.questions, ...ctx.wardRounds].map((r) => r.id);

  const enriched = await generateBundleWithAi(bundle, ctx);
  await useData.getState().save('bundle', enriched);
  return enriched;
}

/**
 * Consolidate all bundles that share a period into ONE (keep the primary,
 * absorb the others' stats/gaps/highlights/sourceIds into it, delete the
 * rest). Used by the Bundles page to tidy up duplicates.
 */
export async function consolidatePeriod(group: Bundle[]): Promise<Bundle | null> {
  const st = useData.getState();
  if (!group.length) return null;
  const primary = group.find((b) => b.type.startsWith('auto')) || group[0];
  const rest = group.filter((b) => b.id !== primary.id);
  if (!rest.length) return primary;

  const merged: Bundle = {
    ...primary,
    stats: { ...primary.stats },
    knowledgeGaps: Array.from(new Set([...primary.knowledgeGaps, ...rest.flatMap((b) => b.knowledgeGaps)])).slice(0, 12),
    recommendedRevision: Array.from(new Set([...primary.recommendedRevision, ...rest.flatMap((b) => b.recommendedRevision)])).slice(0, 8),
    highlights: Array.from(new Set([...primary.highlights, ...rest.flatMap((b) => b.highlights)])).slice(0, 6),
    sourceIds: Array.from(new Set([...primary.sourceIds, ...rest.flatMap((b) => b.sourceIds)])),
    sourceBundleIds: Array.from(new Set([...primary.sourceBundleIds, ...rest.map((b) => b.id)])),
    body: { ...primary.body, consolidated: rest.map((b) => b.title) },
    version: (primary.version ?? 1) + 1,
    updatedAt: Date.now(),
  };
  await st.save('bundle', merged);
  for (const b of rest) {
    await st.remove('bundle', b.id);
  }
  st.setStatus(`✓ Consolidated ${group.length} bundle(s) into one`);
  return merged;
}

async function generateBundleWithAi(bundle: Bundle, ctx: Context): Promise<Bundle> {
  const { bundle: enriched, succeeded } = await enrichWithAi(bundle, ctx);
  if (!succeeded) {
    const pending = { ...enriched, aiPending: true };
    await queueAiPending(pending.id);
    return pending;
  }
  return enriched;
}

export async function mergeBundles(sourceBundleIds: string[], title: string): Promise<Bundle> {
  const s = useData.getState();
  const sources = s.bundles.filter((b) => sourceBundleIds.includes(b.id));
  const start = sources.length ? sources.map((b) => b.periodStart).sort()[0] : todayIso();
  const end = sources.length ? sources.map((b) => b.periodEnd).sort().reverse()[0] : todayIso();

  const bundle = emptyBundle('merged', title, start, end);
  const body: Record<string, unknown> = { mergedFrom: sources.map((b) => ({ id: b.id, title: b.title, type: b.type })) };
  const stats: Record<string, number> = {};
  const gaps: string[] = [];
  const rev: string[] = [];
  const highlights: string[] = [];
  const sourceIds: string[] = [];

  for (const b of sources) {
    Object.assign(stats, b.stats);
    gaps.push(...b.knowledgeGaps);
    rev.push(...b.recommendedRevision);
    highlights.push(...b.highlights);
    sourceIds.push(...b.sourceIds);
    body[b.title] = b.body;
  }
  bundle.body = body;
  bundle.stats = stats;
  bundle.knowledgeGaps = Array.from(new Set(gaps)).slice(0, 12);
  bundle.recommendedRevision = Array.from(new Set(rev)).slice(0, 8);
  bundle.highlights = Array.from(new Set(highlights)).slice(0, 6);
  bundle.sourceIds = Array.from(new Set(sourceIds));
  bundle.sourceBundleIds = sourceBundleIds;
  bundle.summary = `Merged clinical review combining ${sources.length} bundle(s).`;

  const ctx = collectContext(start, end);
  const enriched = await generateBundleWithAi(bundle, ctx);
  await useData.getState().save('bundle', enriched);
  return enriched;
}

/**
 * Create a manual bundle from one or more ward rounds.
 *
 * The bundle REFERENCES the rounds (ids in `sourceIds`, digests in the body)
 * and is an independent artifact: editing or deleting the bundle never touches
 * the original ward rounds, exactly like every other bundle type.
 */
export async function bundleFromWardRounds(roundIds: string[], title: string): Promise<Bundle | null> {
  const st = useData.getState();
  const rounds = st.wardRounds.filter((r) => roundIds.includes(r.id));
  if (!rounds.length) return null;

  const dates = rounds.map((r) => r.date).sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  const digests = rounds.map(digestRound);

  const bundle = emptyBundle('manual-custom', title, start, end);
  const ctx: Context = {
    days: st.days.filter((d) => d.date >= start && d.date <= end),
    diseases: [],
    medicines: [],
    investigations: [],
    questions: [],
    wardRounds: rounds,
    wardDigests: digests,
  };

  bundle.body = {
    ...buildBody(ctx),
    wardRoundDetail: digests,
  };
  bundle.stats = {
    'Ward rounds': rounds.length,
    'Ward captures': digests.reduce((n, d) => n + d.counts.total, 0),
    'Learning points': digests.reduce((n, d) => n + d.counts.learning, 0),
    'Medicines': digests.reduce((n, d) => n + d.counts.medicine, 0),
    'Conditions': digests.reduce((n, d) => n + d.counts.condition, 0),
    'Investigations': digests.reduce((n, d) => n + d.counts.investigation, 0),
    'Questions': digests.reduce((n, d) => n + d.counts.question, 0),
  };
  bundle.knowledgeGaps = localGaps(ctx);
  bundle.recommendedRevision = dedupe(digests.flatMap((d) => d.questions)).slice(0, 8);
  bundle.highlights = localHighlights(ctx);
  bundle.summary = localSummary(bundle.body);
  bundle.sourceIds = rounds.map((r) => r.id);

  const enriched = await generateBundleWithAi(bundle, ctx);
  await useData.getState().save('bundle', enriched);
  return enriched;
}

/** Create a bundle from a subset of entries within a single round. */
export async function bundleFromWardEntries(roundId: string, entryIds: string[], title: string): Promise<Bundle | null> {
  const st = useData.getState();
  const round = st.wardRounds.find((r) => r.id === roundId);
  if (!round) return null;
  const entries = st.wardEntries.filter((e) => e.roundId === roundId && entryIds.includes(e.id));
  if (!entries.length) return null;

  const bundle = emptyBundle('manual-custom', title, round.date, round.date);
  const group = (t: string) =>
    entries.filter((e) => e.type === t).map((e) => (e.title && e.content ? `${e.title} — ${e.content}` : e.title || e.content));

  bundle.body = {
    wardRounds: [{ id: round.id, ward: round.ward, date: round.date, focus: round.focus }],
    selectedEntries: entries.map((e) => ({ id: e.id, type: e.type, title: e.title, content: e.content })),
    lessons: group('learning'),
    medicines: group('medicine'),
    conditions: group('condition'),
    investigations: group('investigation'),
    questions: group('question'),
    notes: group('note'),
  };
  bundle.stats = { 'Selected captures': entries.length, 'Ward rounds': 1 };
  bundle.knowledgeGaps = group('question').slice(0, 10);
  bundle.highlights = group('medicine').slice(0, 3);
  bundle.summary = localSummary(bundle.body);
  bundle.sourceIds = [round.id, ...entries.map((e) => e.id)];

  const ctx: Context = {
    days: [],
    diseases: [],
    medicines: [],
    investigations: [],
    questions: [],
    wardRounds: [round],
    wardDigests: [digestRound(round)],
  };
  const enriched = await generateBundleWithAi(bundle, ctx);
  await useData.getState().save('bundle', enriched);
  return enriched;
}
