import { useData } from '../stores/data';
import { retrieveKnowledge, contextForRecord, listSources } from './intelligence';
import { weekBounds } from './wardRounds';
import { todayIso } from './defaults';

/**
 * 🛠️ AI TOOL SYSTEM
 *
 * Tools let the AI reach real application data instead of guessing. They are
 * split into two strictly separate classes:
 *
 *   READ  — always allowed. Cannot change anything.
 *   WRITE — NEVER runs without explicit user confirmation.
 *
 * The separation is structural, not a convention: write tools live in their own
 * registry and `runTool()` physically refuses to execute one unless it is
 * handed a confirmation token issued by the UI after the user clicked Confirm.
 */

export type ToolKind = 'read' | 'write' | 'navigate';

export interface ToolDef {
  name: string;
  kind: ToolKind;
  description: string;
  /** Human sentence shown in the confirmation dialog for write tools. */
  confirmLabel?: (args: any) => string;
  /** True when the effect is destructive (delete/overwrite). */
  destructive?: boolean;
  run: (args: any) => any;
}

// ---- READ TOOLS --------------------------------------------------------

function listOf(module: string): any[] {
  const src = listSources().find((s) => s.key === module);
  return src ? src.list() : [];
}

function shape(r: any) {
  return {
    id: r.id,
    type: r.type ?? r.module,
    title: r.title,
    summary: r.summary,
    date: r.date,
    academic: r.academicLabel,
  };
}

export const READ_TOOLS: Record<string, ToolDef> = {
  searchKnowledge: {
    name: 'searchKnowledge',
    kind: 'read',
    description: 'Search every module in the app for records matching a query, with optional module/date/level filters.',
    run: (a: { query?: string; modules?: string[]; from?: string; to?: string; level?: string; limit?: number }) => {
      const res = retrieveKnowledge({
        query: a.query,
        modules: a.modules,
        dateRange: a.from || a.to ? { from: a.from, to: a.to } : undefined,
        academicLevel: a.level,
        limit: a.limit ?? 20,
      });
      return { total: res.total, records: res.records.map(shape) };
    },
  },
  getDisease: {
    name: 'getDisease',
    kind: 'read',
    description: 'Get one disease plus its connected medicines, investigations, notes and ward mentions.',
    run: (a: { id?: string; name?: string }) => {
      const list = listOf('disease');
      const rec = a.id ? list.find((r) => r.id === a.id) : list.find((r) => r.title.toLowerCase().includes((a.name ?? '').toLowerCase()));
      if (!rec) return { found: false };
      const ctx = contextForRecord('disease', rec.id);
      return { found: true, record: shape(rec), related: ctx.related.map(shape) };
    },
  },
  getMedicine: {
    name: 'getMedicine',
    kind: 'read',
    description: 'Get one medicine plus everything connected to it.',
    run: (a: { id?: string; name?: string }) => {
      const list = listOf('medicine');
      const rec = a.id ? list.find((r) => r.id === a.id) : list.find((r) => r.title.toLowerCase().includes((a.name ?? '').toLowerCase()));
      if (!rec) return { found: false };
      const ctx = contextForRecord('medicine', rec.id);
      return { found: true, record: shape(rec), related: ctx.related.map(shape) };
    },
  },
  getInvestigation: {
    name: 'getInvestigation',
    kind: 'read',
    description: 'Get one investigation and its connections.',
    run: (a: { id?: string; name?: string }) => {
      const list = listOf('investigation');
      const rec = a.id ? list.find((r) => r.id === a.id) : list.find((r) => r.title.toLowerCase().includes((a.name ?? '').toLowerCase()));
      if (!rec) return { found: false };
      const ctx = contextForRecord('investigation', rec.id);
      return { found: true, record: shape(rec), related: ctx.related.map(shape) };
    },
  },
  getLearningNotes: {
    name: 'getLearningNotes',
    kind: 'read',
    description: 'List learning notes / lessons, optionally filtered by query or date range.',
    run: (a: { query?: string; from?: string; to?: string; limit?: number }) => {
      const res = retrieveKnowledge({
        query: a.query,
        modules: ['lesson'],
        dateRange: a.from || a.to ? { from: a.from, to: a.to } : undefined,
        limit: a.limit ?? 25,
      });
      return { total: res.total, records: res.records.map(shape) };
    },
  },
  getQuestions: {
    name: 'getQuestions',
    kind: 'read',
    description: 'List questions. Set unansweredOnly to find questions still without an answer.',
    run: (a: { query?: string; unansweredOnly?: boolean; limit?: number }) => {
      const res = retrieveKnowledge({ query: a.query, modules: ['question'], limit: a.limit ?? 50 });
      let records = res.records;
      if (a.unansweredOnly) {
        records = records.filter((r) => {
          const raw: any = r.raw ?? {};
          const ans = raw.answer ?? raw.body?.answer ?? '';
          return !String(ans).trim();
        });
      }
      return { total: records.length, records: records.map(shape) };
    },
  },
  getWardRounds: {
    name: 'getWardRounds',
    kind: 'read',
    description: 'List ward rounds and the learning captured in them.',
    run: (a: { query?: string; from?: string; to?: string; latest?: boolean; limit?: number }) => {
      const res = retrieveKnowledge({
        query: a.query,
        modules: ['wardRound'],
        dateRange: a.from || a.to ? { from: a.from, to: a.to } : undefined,
        limit: a.latest ? 1 : a.limit ?? 20,
      });
      const records = res.records;
      if (a.latest && records[0]) {
        const ctx = contextForRecord('wardRound', records[0].id);
        return { total: 1, records: [shape(records[0])], entries: ctx.related.map(shape) };
      }
      return { total: res.total, records: records.map(shape) };
    },
  },
  getBundles: {
    name: 'getBundles',
    kind: 'read',
    description: 'List saved bundles (frozen snapshots of a day, week or custom period).',
    run: (a: { query?: string; limit?: number }) => {
      const res = retrieveKnowledge({ query: a.query, modules: ['bundle'], limit: a.limit ?? 20 });
      return { total: res.total, records: res.records.map(shape) };
    },
  },
  getRevisionItems: {
    name: 'getRevisionItems',
    kind: 'read',
    description: 'List spaced-repetition items with their real stored confidence and due dates.',
    run: (a: { dueOnly?: boolean; weakOnly?: boolean; limit?: number }) => {
      const st = useData.getState();
      let items: any[] = (st as any).revisions ?? [];
      const today = todayIso();
      if (a.dueOnly) items = items.filter((r) => (r.due ?? r.body?.due ?? '') <= today);
      if (a.weakOnly) items = items.filter((r) => (r.confidence ?? r.body?.confidence ?? 3) <= 2);
      return {
        total: items.length,
        records: items.slice(0, a.limit ?? 30).map((r) => ({
          id: r.id,
          title: r.title ?? r.body?.title ?? 'Revision item',
          due: r.due ?? r.body?.due,
          confidence: r.confidence ?? r.body?.confidence,
        })),
      };
    },
  },
  getAcademicHistory: {
    name: 'getAcademicHistory',
    kind: 'read',
    description: 'The student\'s academic stages, current level and progression.',
    run: () => {
      const st = useData.getState();
      const stages: any[] = (st as any).academicStages ?? [];
      return {
        currentStageId: st.profile?.currentStageId,
        programme: st.profile?.programme,
        stages: stages.map((s) => ({ id: s.id, name: s.name, academicYear: s.academicYear, level: s.level })),
      };
    },
  },
  getCourses: {
    name: 'getCourses',
    kind: 'read',
    description: 'List the student\'s courses.',
    run: (a: { query?: string; limit?: number }) => {
      const res = retrieveKnowledge({ query: a.query, modules: ['course'], limit: a.limit ?? 40 });
      return { total: res.total, records: res.records.map(shape) };
    },
  },
  getWeekSummary: {
    name: 'getWeekSummary',
    kind: 'read',
    description: 'Everything the student recorded during a given week (defaults to this week).',
    run: (a: { date?: string }) => {
      const w = weekBounds(a.date ?? todayIso());
      const res = retrieveKnowledge({ dateRange: { from: w.start, to: w.end }, limit: 60 });
      return { from: w.start, to: w.end, total: res.total, records: res.records.map(shape) };
    },
  },
};

// ---- WRITE TOOLS -------------------------------------------------------

/**
 * Write tools are declared here but CANNOT be executed by `runTool` without a
 * confirmation token. The AI may only ever *propose* one of these.
 */
export const WRITE_TOOLS: Record<string, ToolDef> = {
  createLearningNote: {
    name: 'createLearningNote',
    kind: 'write',
    description: 'Create a new learning note in the student\'s records.',
    confirmLabel: (a) => `Create a learning note titled "${a?.title ?? 'Untitled'}"?`,
    run: (a: { title: string; content: string; tags?: string[] }) => {
      const st = useData.getState();
      const rec = st.save('lesson', {
        title: a.title || 'AI note',
        body: { content: a.content ?? '', aiGenerated: true },
        tags: a.tags ?? [],
      } as any);
      return { created: true, id: (rec as any)?.id };
    },
  },
  createQuestion: {
    name: 'createQuestion',
    kind: 'write',
    description: 'Save a question to the student\'s question bank.',
    confirmLabel: (a) => `Save the question "${String(a?.question ?? '').slice(0, 60)}"?`,
    run: (a: { question: string; answer?: string; tags?: string[] }) => {
      const st = useData.getState();
      const rec = st.save('question', {
        title: a.question,
        body: { question: a.question, answer: a.answer ?? '', aiGenerated: true },
        tags: a.tags ?? [],
      } as any);
      return { created: true, id: (rec as any)?.id };
    },
  },
  createBundle: {
    name: 'createBundle',
    kind: 'write',
    description: 'Create a bundle snapshot for a period.',
    confirmLabel: (a) => `Create a bundle for ${a?.from ?? 'the selected period'}${a?.to && a.to !== a.from ? ` → ${a.to}` : ''}?`,
    run: async (a: { from: string; to: string; title?: string }) => {
      const engine = await import('./bundleEngine');
      const b = await engine.generateSnapshot({
        type: 'manual-custom',
        title: a.title?.trim() || `Bundle ${a.from}${a.to && a.to !== a.from ? ` → ${a.to}` : ''}`,
        selection: { from: a.from, to: a.to },
        creationMethod: 'manual',
      });
      return { created: true, id: b.id, status: b.status };
    },
  },
  markForRevision: {
    name: 'markForRevision',
    kind: 'write',
    description: 'Add a record to the spaced-repetition revision queue.',
    confirmLabel: (a) => `Add "${a?.title ?? a?.id}" to your revision queue?`,
    run: (a: { module: string; id: string; title?: string }) => {
      const st = useData.getState();
      const rec = st.save('revision', {
        title: a.title ?? 'Revision item',
        body: { sourceType: a.module, sourceId: a.id, confidence: 1, due: todayIso() },
      } as any);
      return { created: true, id: (rec as any)?.id };
    },
  },
};

export const ALL_TOOLS: Record<string, ToolDef> = { ...READ_TOOLS, ...WRITE_TOOLS };

export function toolNames(): string[] {
  return Object.keys(ALL_TOOLS);
}

export function isWriteTool(name: string): boolean {
  return name in WRITE_TOOLS;
}

// ---- Permission gate ---------------------------------------------------

export interface ToolCall {
  tool: string;
  args?: Record<string, any>;
}

export type ToolOutcome =
  | { status: 'ok'; result: any }
  | { status: 'needs-confirmation'; tool: string; args: any; label: string; destructive: boolean }
  | { status: 'error'; error: string };

/** Confirmation tokens are single-use and issued only by the UI. */
const grants = new Set<string>();

export function grantConfirmation(token: string): void {
  grants.add(token);
}

/**
 * Execute a tool.
 *
 * READ tools run immediately. WRITE tools return `needs-confirmation` unless a
 * valid single-use token is supplied — there is no code path that writes
 * without the user having pressed Confirm.
 */
export async function runTool(call: ToolCall, confirmToken?: string): Promise<ToolOutcome> {
  const def = ALL_TOOLS[call.tool];
  if (!def) return { status: 'error', error: `Unknown tool "${call.tool}".` };

  if (def.kind === 'write') {
    if (!confirmToken || !grants.has(confirmToken)) {
      return {
        status: 'needs-confirmation',
        tool: def.name,
        args: call.args ?? {},
        label: def.confirmLabel ? def.confirmLabel(call.args ?? {}) : `Allow AI to run ${def.name}?`,
        destructive: !!def.destructive,
      };
    }
    grants.delete(confirmToken); // single use
  }

  try {
    const result = await def.run(call.args ?? {});
    return { status: 'ok', result };
  } catch (e: any) {
    return { status: 'error', error: e?.message ?? 'Tool failed.' };
  }
}

/** A short catalogue the model can be shown so it knows what it can ask for. */
export function toolCatalogue(): string {
  const lines: string[] = ['READ TOOLS (always available):'];
  for (const t of Object.values(READ_TOOLS)) lines.push(`- ${t.name}: ${t.description}`);
  lines.push('', 'WRITE TOOLS (require the student to press Confirm first):');
  for (const t of Object.values(WRITE_TOOLS)) lines.push(`- ${t.name}: ${t.description}`);
  return lines.join('\n');
}
