import { useData } from '../stores/data';
import type { Bundle, BundleCreateInput, ClinicalDay, Disease, Medicine, Investigation, Question } from '../types';
import { emptyBundle, todayIso } from './defaults';
import { aiChat } from './ai';

interface Context {
  days: ClinicalDay[];
  diseases: Disease[];
  medicines: Medicine[];
  investigations: Investigation[];
  questions: Question[];
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

  return { days, diseases, medicines, investigations, questions };
}

function statsFor(ctx: Context): Record<string, number> {
  return {
    'Clinical days': ctx.days.length,
    'Conditions': ctx.diseases.length,
    'Medicines': ctx.medicines.length,
    'Investigations': ctx.investigations.length,
    'Questions': ctx.questions.length,
    'Open questions': ctx.questions.filter((q) => q.status === 'open').length,
  };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

function buildBody(ctx: Context): Record<string, unknown> {
  const conditions = dedupe(ctx.days.flatMap((d) => d.conditions).concat(ctx.diseases.map((d) => d.name)));
  const meds = dedupe(ctx.days.flatMap((d) => d.medicines).concat(ctx.medicines.map((m) => m.name)));
  const labs = dedupe(ctx.days.flatMap((d) => d.investigations).concat(ctx.investigations.map((i) => i.name)));
  const lessons = dedupe(ctx.days.flatMap((d) => d.lessons));
  const uncertainties = dedupe(ctx.days.flatMap((d) => d.uncertainties));
  const topics = dedupe(ctx.days.flatMap((d) => d.topicsToResearch));

  return {
    conditions,
    medicines: meds,
    investigations: labs,
    lessons,
    uncertainties,
    topics,
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
  if (!lines.length) lines.push('No clinical activity recorded in this period.');
  return lines.join('\n');
}

function localGaps(ctx: Context): string[] {
  const gaps = new Set<string>();
  for (const d of ctx.days) for (const u of d.uncertainties) if (u.trim()) gaps.add(u.trim());
  for (const q of ctx.questions) if (q.status === 'open' && q.text.trim()) gaps.add(q.text.trim());
  return Array.from(gaps).slice(0, 10);
}

function localHighlights(ctx: Context): string[] {
  const counts = new Map<string, number>();
  for (const m of ctx.medicines) counts.set(m.name, (counts.get(m.name) ?? 0) + m.encounters);
  for (const m of ctx.days.flatMap((d) => d.medicines)) counts.set(m, (counts.get(m) ?? 0) + 1);
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return top.map(([name, n]) => `${name} (${n}x)`);
}

async function enrichWithAi(bundle: Bundle, ctx: Context): Promise<Bundle> {
  const settings = useData.getState().settings;
  const cfg = settings?.ai?.['bundler'];
  if (!cfg?.enabled || !cfg.apiKey) return bundle; // stay offline/local

  const prompt = [
    `You are CLINICAL Rx, a clinical learning assistant for a Level 200 Pharmacy student.`,
    `Produce a concise daily/weekly clinical learning summary from the data below.`,
    `Return a clear summary, then "KNOWLEDGE GAPS:" list, then "RECOMMENDED REVISION:" list, then "HIGHLIGHTS:" list.`,
    `DATA:`,
    JSON.stringify(bundle.body),
  ].join('\n');

  const res = await aiChat(cfg, 'You write concise clinical learning summaries for pharmacy students.', prompt);
  if (res.ok) {
    const t = res.text;
    const pick = (label: string) =>
      (t.split(label)[1]?.split('\n').slice(1).filter((l) => l.trim().startsWith('-') || /^\d+[.)]/.test(l.trim())).map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean)) || [];
    bundle = { ...bundle, summary: t, aiModel: cfg.model };
    const gaps = pick('KNOWLEDGE GAPS').length ? pick('KNOWLEDGE GAPS') : bundle.knowledgeGaps;
    const rev = pick('RECOMMENDED REVISION').length ? pick('RECOMMENDED REVISION') : bundle.recommendedRevision;
    bundle = { ...bundle, knowledgeGaps: gaps, recommendedRevision: rev };
  }
  return bundle;
}

export async function generateBundle(input: BundleCreateInput): Promise<Bundle> {
  const start = input.periodStart || todayIso();
  const end = input.periodEnd || todayIso();
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
  bundle.sourceIds = [...ctx.days, ...ctx.diseases, ...ctx.medicines, ...ctx.investigations, ...ctx.questions].map((r) => r.id);

  const enriched = await enrichWithAi(bundle, ctx);
  await useData.getState().save('bundle', enriched);
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

  const enriched = await enrichWithAi(bundle, collectContext(start, end));
  await useData.getState().save('bundle', enriched);
  return enriched;
}
