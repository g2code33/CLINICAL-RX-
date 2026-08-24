import { useData } from '../stores/data';
import { getStage } from './academic';
import { academicLabel, relatedTo } from './learning';
import type { AcademicLink, ModuleType } from '../types';

/**
 * 🧠 CLINICAL Rx INTELLIGENCE LAYER
 *
 * This is NOT an AI model. It is the application's structured
 * context/retrieval system — the bridge between the local database and any
 * future AI provider (cloud or local).
 *
 * Core principle:
 *
 *   ONE APPLICATION-WIDE KNOWLEDGE LAYER, MULTIPLE AI PERSONAS.
 *
 * Every AI module queries THIS layer rather than reaching into the store, so
 * no AI is ever locked to a single section. Future modules (Bundles, CPD,
 * Research, Career, Portfolio) register a `KnowledgeSource` here and become
 * instantly visible to every AI persona without touching AI code.
 *
 * Everything is local and synchronous — no network, no cloud dependency.
 */

// ---- Common record shape ----------------------------------------------

/** A normalised record returned by any knowledge source. */
export interface KnowledgeRecord {
  id: string;
  /** Stable source key, e.g. 'medicine' | 'wardRound' | 'course'. */
  type: string;
  module: ModuleType | string;
  title: string;
  summary: string;
  date: string; // yyyy-mm-dd
  academic?: AcademicLink;
  academicLabel?: string;
  tags?: string[];
  /** Ids of directly related records, for graph traversal. */
  relationships?: Array<{ type: string; id: string; title: string }>;
  /** Original record, for callers that need the full shape. */
  raw?: unknown;
}

/**
 * Every module exposes its searchable records through this interface. The AI
 * layer queries sources without knowing how any table is stored internally.
 */
export interface KnowledgeSource {
  /** Unique key, e.g. 'medicine'. */
  key: string;
  /** Human label, e.g. 'Medicines'. */
  label: string;
  icon: string;
  /** Which app area it belongs to — used for scoping AI personas. */
  domain: 'clinical' | 'academic' | 'professional';
  /** All records this source can offer (already normalised). */
  list(): KnowledgeRecord[];
  /** Optional: resolve one record by id (defaults to scanning `list()`). */
  get?(id: string): KnowledgeRecord | null;
}

// ---- Registry ----------------------------------------------------------

const registry = new Map<string, KnowledgeSource>();

/** Register a module with the Intelligence Layer. Idempotent. */
export function registerSource(source: KnowledgeSource): void {
  registry.set(source.key, source);
}

export function unregisterSource(key: string): void {
  registry.delete(key);
}

export function listSources(): KnowledgeSource[] {
  return Array.from(registry.values());
}

export function getSource(key: string): KnowledgeSource | null {
  return registry.get(key) ?? null;
}

// ---- Helpers -----------------------------------------------------------

function isoOf(rec: any): string {
  if (rec?.date) return rec.date;
  if (rec?.lastSeen) return rec.lastSeen;
  const d = new Date(rec?.createdAt ?? Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clip(text: unknown, n = 300): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function baseRecord(module: ModuleType, type: string, rec: any, title: string, summary: string): KnowledgeRecord {
  return {
    id: rec.id,
    type,
    module,
    title: title || 'Untitled',
    summary: clip(summary),
    date: isoOf(rec),
    academic: rec.academic,
    academicLabel: academicLabel(rec) || undefined,
    tags: rec.tags,
    raw: rec,
  };
}

// ---- Built-in sources --------------------------------------------------

const diseaseSource: KnowledgeSource = {
  key: 'disease',
  label: 'Diseases',
  icon: '🦠',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .diseases.filter((d) => !d.archived)
      .map((d) =>
        baseRecord('disease', 'disease', d, d.name, [d.what, d.why, d.clinicalReasoning, d.personalNotes].filter(Boolean).join(' — '))
      ),
};

const medicineSource: KnowledgeSource = {
  key: 'medicine',
  label: 'Medicines',
  icon: '💊',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .medicines.filter((m) => !m.archived)
      .map((m) =>
        baseRecord('medicine', 'medicine', m, m.name, [m.className, m.mechanism, m.counselling, m.personalNotes].filter(Boolean).join(' — '))
      ),
};

const investigationSource: KnowledgeSource = {
  key: 'investigation',
  label: 'Investigations',
  icon: '🧪',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .investigations.filter((i) => !i.archived)
      .map((i) =>
        baseRecord('investigation', 'investigation', i, i.name, [i.whyRequested, i.interpretation, i.clinicalSignificance].filter(Boolean).join(' — '))
      ),
};

const learningSource: KnowledgeSource = {
  key: 'lesson',
  label: 'Learning Notes',
  icon: '💡',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .lessons.filter((l) => !l.archived)
      .map((l) => baseRecord('lesson', 'lesson', l, l.title, l.content)),
};

const questionSource: KnowledgeSource = {
  key: 'question',
  label: 'Questions',
  icon: '❓',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .questions.filter((q) => !q.archived)
      .map((q) => {
        const r = baseRecord('question', 'question', q, q.text, q.answer ?? `Status: ${q.status}`);
        r.relationships = [q.diseaseId && { type: 'disease', id: q.diseaseId }, q.medicineId && { type: 'medicine', id: q.medicineId }, q.investigationId && { type: 'investigation', id: q.investigationId }]
          .filter(Boolean)
          .map((x: any) => ({ ...x, title: '' }));
        return r;
      }),
};

const revisionSource: KnowledgeSource = {
  key: 'revision',
  label: 'Revision',
  icon: '📚',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .revisions.map((r) =>
        baseRecord('revision', 'revision', r, r.topic, `Box ${r.box ?? 0}${(r as any).confidence ? `, confidence ${(r as any).confidence}/5` : ''}`)
      ),
};

const clinicalDaySource: KnowledgeSource = {
  key: 'day',
  label: 'Clinical Days',
  icon: '📋',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .days.map((d) =>
        baseRecord(
          'day',
          'day',
          d,
          `Clinical Day ${d.dayNumber} — ${d.site}`,
          [
            d.conditions?.length ? `Conditions: ${d.conditions.join(', ')}` : '',
            d.medicines?.length ? `Medicines: ${d.medicines.join(', ')}` : '',
            d.investigations?.length ? `Investigations: ${d.investigations.join(', ')}` : '',
            d.lessons?.length ? `Lessons: ${d.lessons.join(' | ')}` : '',
          ]
            .filter(Boolean)
            .join(' — ')
        )
      ),
};

const wardRoundSource: KnowledgeSource = {
  key: 'wardRound',
  label: 'Ward Rounds',
  icon: '🏥',
  domain: 'clinical',
  list: () => {
    const s = useData.getState();
    return s.wardRounds
      .filter((r) => !r.archived)
      .map((r) => {
        const entries = s.wardEntries.filter((e) => e.roundId === r.id);
        const rec = baseRecord(
          'wardRound',
          'wardRound',
          r,
          `${r.ward}${r.focus ? ` — ${r.focus}` : ''}`,
          [
            r.objective ? `Objective: ${r.objective}` : '',
            `${entries.length} capture(s)`,
            entries.slice(0, 10).map((e) => `${e.title || ''}${e.title && e.content ? ': ' : ''}${e.content}`).join(' | '),
            r.reflection ? `Reflection: ${r.reflection}` : '',
          ]
            .filter(Boolean)
            .join(' — ')
        );
        // Ward rounds are hubs: expose what they link to.
        rec.relationships = entries
          .filter((e) => e.linkedRecordId && e.linkedModule)
          .map((e) => ({ type: String(e.linkedModule), id: String(e.linkedRecordId), title: e.title || e.content.slice(0, 40) }));
        return rec;
      });
  },
};

/** Ward entries are searchable in their own right (learning points, reasoning…). */
const wardEntrySource: KnowledgeSource = {
  key: 'wardEntry',
  label: 'Ward Round Captures',
  icon: '🏥',
  domain: 'clinical',
  list: () => {
    const s = useData.getState();
    return s.wardEntries.map((e) => {
      const round = s.wardRounds.find((r) => r.id === e.roundId);
      const reasoning = e.reasoning
        ? Object.entries(e.reasoning)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')
        : '';
      const rec = baseRecord(
        'wardEntry',
        e.type,
        { ...e, date: round?.date, academic: round?.academic },
        e.title || clip(e.content, 60),
        [e.content, reasoning].filter(Boolean).join(' — ')
      );
      rec.relationships = [
        { type: 'wardRound', id: e.roundId, title: round?.ward ?? 'Ward round' },
        ...(e.linkedRecordId && e.linkedModule ? [{ type: String(e.linkedModule), id: e.linkedRecordId, title: e.title }] : []),
      ];
      return rec;
    });
  },
};

const academicSource: KnowledgeSource = {
  key: 'academicStage',
  label: 'Academic Journey',
  icon: '🎓',
  domain: 'academic',
  list: () => {
    const s = useData.getState();
    return s.academicStages.map((st) => {
      const courses = s.courses.filter((c) => c.stageId === st.id).map((c) => c.title);
      return baseRecord(
        'academicStage',
        'academicStage',
        { ...st, date: st.startDate },
        `${st.name} — ${st.academicYear}`,
        `${st.status}${courses.length ? `; courses: ${courses.join(', ')}` : ''}`
      );
    });
  },
};

const courseSource: KnowledgeSource = {
  key: 'course',
  label: 'Courses',
  icon: '📚',
  domain: 'academic',
  list: () => {
    const s = useData.getState();
    return s.courses.map((c) => {
      const stage = getStage(c.stageId);
      return baseRecord(
        'course',
        'course',
        c,
        c.title,
        [c.code, stage ? `${stage.name} ${stage.academicYear}` : ''].filter(Boolean).join(' — ')
      );
    });
  },
};

const quizSource: KnowledgeSource = {
  key: 'quiz',
  label: 'Quizzes',
  icon: '📝',
  domain: 'clinical',
  list: () =>
    useData.getState().quizzes.map((q) => baseRecord('quiz', 'quiz', q, q.title, `Scored ${q.score}/${q.total}`)),
};

const bundleSource: KnowledgeSource = {
  key: 'bundle',
  label: 'Bundles',
  icon: '📦',
  domain: 'clinical',
  list: () =>
    useData
      .getState()
      .bundles.map((b) => baseRecord('bundle', 'bundle', { ...b, date: b.periodStart }, b.title, b.summary)),
};


// ---- Phase 6: professional / PharmD Journey sources --------------------
//
// Registering here is what makes the whole career system reachable by
// Universal Search, the Command Bar, the AI Orchestrator and every AI persona
// — without any of them knowing these tables exist.

const clinicalExperienceSource: KnowledgeSource = {
  key: 'clinicalExperience',
  label: 'Clinical Experience',
  icon: '🏥',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .clinicalExperiences.filter((e) => !e.archived)
      .map((e) =>
        baseRecord('clinicalExperience', 'clinicalExperience', { ...e, date: e.startDate }, e.title, [
          e.clinicalArea,
          e.institution,
          e.description,
          e.reflections,
          (e.objectives ?? []).join(', '),
          (e.skillsPracticed ?? []).join(', '),
        ].filter(Boolean).join(' — '))
      ),
};

const skillSource: KnowledgeSource = {
  key: 'skill',
  label: 'Skills',
  icon: '🧠',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .skills.filter((s) => !s.archived)
      .map((s) =>
        baseRecord('skill', 'skill', { ...s, date: s.dateDeveloped }, s.title, [
          `${s.category} skill`,
          `self-rated ${s.confidence}/5`,
          s.description,
          s.notes,
          (s.evidence ?? []).length ? `${(s.evidence ?? []).length} evidence link(s)` : '',
        ].filter(Boolean).join(' — '))
      ),
};

const achievementSource: KnowledgeSource = {
  key: 'achievement',
  label: 'Achievements',
  icon: '🏆',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .achievements.filter((a) => !a.archived)
      .map((a) => baseRecord('achievement', 'achievement', a, a.title, [a.category, a.description].filter(Boolean).join(' — '))),
};

const certificationSource: KnowledgeSource = {
  key: 'certification',
  label: 'Certifications',
  icon: '📜',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .certifications.filter((c) => !c.archived)
      // Credential/reference numbers are personal identifiers. They are
      // stripped BEFORE indexing, so they can never reach search results,
      // `raw`, an AI prompt or an export.
      .map(({ credentialId: _omit, attachmentRef: _omit2, ...c }) =>
        baseRecord('certification', 'certification', { ...c, date: c.dateObtained }, c.title, [c.issuer, c.category, c.description].filter(Boolean).join(' — '))
      ),
};

const projectSource: KnowledgeSource = {
  key: 'project',
  label: 'Projects',
  icon: '💻',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .projects.filter((p) => !p.archived)
      .map((p) =>
        baseRecord('project', 'project', { ...p, date: p.startDate }, p.title, [
          p.status,
          p.role,
          p.description,
          p.outcomes,
          (p.technologies ?? []).join(', '),
        ].filter(Boolean).join(' — '))
      ),
};

const researchSource: KnowledgeSource = {
  key: 'research',
  label: 'Research',
  icon: '🔬',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .research.filter((r) => !r.archived)
      .map((r) =>
        baseRecord('research', 'research', { ...r, date: r.startDate }, r.title, [
          r.kind,
          r.topic,
          r.description,
          r.venue,
          r.authors,
        ].filter(Boolean).join(' — '))
      ),
};

const leadershipSource: KnowledgeSource = {
  key: 'leadership',
  label: 'Leadership',
  icon: '🏅',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .leadership.filter((l) => !l.archived)
      .map((l) =>
        baseRecord('leadership', 'leadership', { ...l, date: l.startDate }, `${l.position} — ${l.organization}`, [
          l.description,
          (l.responsibilities ?? []).join(', '),
          (l.achievements ?? []).join(', '),
        ].filter(Boolean).join(' — '))
      ),
};

const goalSource: KnowledgeSource = {
  key: 'goal',
  label: 'Goals',
  icon: '🎯',
  domain: 'professional',
  list: () =>
    useData
      .getState()
      .goals.filter((g) => !g.archived)
      .map((g) => {
        const ms = g.milestones ?? [];
        const done = ms.filter((m) => m.done).length;
        return baseRecord('goal', 'goal', { ...g, date: g.startDate }, g.title, [
          g.category,
          g.status,
          g.description,
          ms.length ? `${done}/${ms.length} milestones complete` : '',
        ].filter(Boolean).join(' — '));
      }),
};

/** Register every built-in source. Future modules call registerSource() too. */
for (const s of [
  diseaseSource,
  medicineSource,
  investigationSource,
  learningSource,
  questionSource,
  revisionSource,
  clinicalDaySource,
  wardRoundSource,
  wardEntrySource,
  academicSource,
  courseSource,
  quizSource,
  bundleSource,
  // Phase 6 — professional journey
  clinicalExperienceSource,
  skillSource,
  achievementSource,
  certificationSource,
  projectSource,
  researchSource,
  leadershipSource,
  goalSource,
]) {
  registerSource(s);
}

// ---- Central retrieval -------------------------------------------------

export interface RetrieveOptions {
  /** Free-text query. Empty returns the most recent records. */
  query?: string;
  /** Restrict to specific source keys. Empty/omitted = every source. */
  modules?: string[];
  /** Restrict to a domain (e.g. only academic sources). */
  domain?: KnowledgeSource['domain'];
  dateRange?: { from?: string; to?: string };
  academicLevel?: string;
  stageId?: string;
  courseId?: string;
  tag?: string;
  limit?: number;
  /** Include related records for each hit (one hop). */
  includeRelationships?: boolean;
}

export interface RetrieveResult {
  query: string;
  total: number;
  /** Hits grouped by source key. */
  groups: Array<{ key: string; label: string; icon: string; records: KnowledgeRecord[] }>;
  /** Flat, relevance-ordered list. */
  records: KnowledgeRecord[];
}

function scoreRecord(rec: KnowledgeRecord, q: string): number {
  if (!q) return 1;
  const title = rec.title.toLowerCase();
  const summary = rec.summary.toLowerCase();
  const tags = (rec.tags ?? []).join(' ').toLowerCase();
  let score = 0;
  if (title === q) score += 100;
  if (title.includes(q)) score += 50;
  if (tags.includes(q)) score += 20;
  if (summary.includes(q)) score += 10;
  // Prefer words over substrings inside longer words.
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) score += 25;
  return score;
}

/**
 * THE bridge between the database and any future AI provider.
 *
 * Retrieves relevant records across every registered module, honouring
 * academic scope, date range and tags. Returns structured records — never raw
 * table rows — so an AI provider never needs to know the storage layout.
 */
export function retrieveKnowledge(options: RetrieveOptions = {}): RetrieveResult {
  const q = (options.query ?? '').trim().toLowerCase();
  const limit = options.limit ?? 40;
  const sources = listSources().filter((s) => {
    if (options.modules?.length && !options.modules.includes(s.key)) return false;
    if (options.domain && s.domain !== options.domain) return false;
    return true;
  });

  const scored: Array<{ rec: KnowledgeRecord; source: KnowledgeSource; score: number }> = [];

  for (const source of sources) {
    let records: KnowledgeRecord[];
    try {
      records = source.list();
    } catch {
      continue; // a broken source must never break retrieval
    }
    for (const rec of records) {
      // --- scope filters ---
      if (options.dateRange?.from && rec.date < options.dateRange.from) continue;
      if (options.dateRange?.to && rec.date > options.dateRange.to) continue;
      if (options.stageId && rec.academic?.stageId !== options.stageId) continue;
      if (options.academicLevel && String(rec.academic?.level ?? '') !== String(options.academicLevel)) continue;
      if (options.courseId && rec.academic?.courseId !== options.courseId) continue;
      if (options.tag && !(rec.tags ?? []).includes(options.tag)) continue;

      const score = q
        ? scoreRecord(rec, q)
        : // No query: recency wins.
          1;
      if (q && score === 0) continue;
      scored.push({ rec, source, score });
    }
  }

  scored.sort((a, b) => (b.score - a.score) || (a.rec.date < b.rec.date ? 1 : -1));
  const top = scored.slice(0, limit);

  if (options.includeRelationships) {
    for (const { rec } of top) {
      if (rec.relationships?.length) continue;
      try {
        const rel = relatedTo(rec.module as ModuleType, rec.id);
        rec.relationships = [
          ...rel.diseases.map((r) => ({ type: 'disease', id: r.id, title: r.name })),
          ...rel.medicines.map((r) => ({ type: 'medicine', id: r.id, title: r.name })),
          ...rel.investigations.map((r) => ({ type: 'investigation', id: r.id, title: r.name })),
          ...rel.lessons.map((r) => ({ type: 'lesson', id: r.id, title: r.title })),
          ...rel.questions.map((r) => ({ type: 'question', id: r.id, title: r.text })),
        ].slice(0, 12);
      } catch {
        /* relationships are best-effort */
      }
    }
  }

  const groups = new Map<string, { key: string; label: string; icon: string; records: KnowledgeRecord[] }>();
  for (const { rec, source } of top) {
    const g = groups.get(source.key) ?? { key: source.key, label: source.label, icon: source.icon, records: [] };
    g.records.push(rec);
    groups.set(source.key, g);
  }

  return {
    query: options.query ?? '',
    total: top.length,
    groups: Array.from(groups.values()),
    records: top.map((t) => t.rec),
  };
}

// ---- Cross-module context for a single record --------------------------

export interface RecordContext {
  focus: KnowledgeRecord | null;
  related: KnowledgeRecord[];
  academic: { stage?: string; year?: string; course?: string };
  history: KnowledgeRecord[];
}

/**
 * Everything an AI needs to answer "tell me about THIS".
 *
 * Given a disease, it gathers the disease record, its medicines,
 * investigations, learning notes, questions, the ward rounds where it came up
 * and its revision state — the connected knowledge graph around one node.
 */
export function contextForRecord(module: ModuleType | string, id: string): RecordContext {
  const source = listSources().find((s) => s.key === module);
  const focus = source ? source.list().find((r) => r.id === id) ?? null : null;

  const related: KnowledgeRecord[] = [];
  if (focus) {
    try {
      const rel = relatedTo(module as ModuleType, id);
      const push = (list: any[], key: string) => {
        const src = getSource(key);
        if (!src) return;
        const all = src.list();
        for (const r of list) {
          const found = all.find((x) => x.id === r.id);
          if (found) related.push(found);
        }
      };
      push(rel.diseases, 'disease');
      push(rel.medicines, 'medicine');
      push(rel.investigations, 'investigation');
      push(rel.lessons, 'lesson');
      push(rel.questions, 'question');
    } catch {
      /* ignore */
    }

    const s = useData.getState();

    // A ward round's OWN captured entries are the heart of "what did I learn
    // during that round?" — without this the round looks empty to the AI.
    if (module === 'wardRound') {
      const entrySrc = getSource('wardEntry');
      if (entrySrc) {
        const mine = new Set(s.wardEntries.filter((e) => e.roundId === id).map((e) => e.id));
        for (const r of entrySrc.list()) if (mine.has(r.id)) related.push(r);
      }
    }

    // Conversely, a ward entry should carry its parent round.
    if (module === 'wardEntry') {
      const parent = s.wardEntries.find((e) => e.id === id)?.roundId;
      const roundSrc = getSource('wardRound');
      if (parent && roundSrc) {
        const r = roundSrc.list().find((x) => x.id === parent);
        if (r) related.push(r);
      }
    }

    // Phase 6: professional records resolve their EVIDENCE links, and any
    // professional record that cites this one as evidence (backlinks). This is
    // what lets the AI answer "what evidence supports this skill?".
    const PRO_KEYS = ['clinicalExperience', 'skill', 'achievement', 'certification', 'project', 'research', 'leadership', 'goal'];
    const focusRaw = focus.raw as any;
    for (const ev of (focusRaw?.evidence ?? []) as Array<{ type: string; id: string }>) {
      const src = getSource(ev.type);
      const hit = src?.list().find((r) => r.id === ev.id);
      if (hit) related.push(hit);
    }
    for (const key of PRO_KEYS) {
      const src = getSource(key);
      if (!src) continue;
      for (const r of src.list()) {
        const raw = r.raw as any;
        if (r.id === id) continue;
        const cites = (raw?.evidence ?? []).some((e: any) => e.type === module && e.id === id);
        const listed =
          (raw?.skillIds ?? []).includes(id) ||
          (raw?.relatedSkillIds ?? []).includes(id) ||
          (raw?.relatedRoundIds ?? []).includes(id) ||
          raw?.relatedProjectId === id ||
          raw?.relatedExperienceId === id ||
          raw?.relatedCourseId === id;
        if (cites || listed) related.push(r);
      }
    }

    // Ward rounds that reference this record, plus its revision state.
    const roundIds = new Set(
      s.wardEntries.filter((e) => e.linkedRecordId === id).map((e) => e.roundId)
    );
    const wardSrc = getSource('wardRound');
    if (wardSrc && roundIds.size) {
      for (const r of wardSrc.list()) if (roundIds.has(r.id)) related.push(r);
    }
    const revSrc = getSource('revision');
    if (revSrc) {
      for (const r of revSrc.list()) {
        if ((r.raw as any)?.sourceId === id) related.push(r);
      }
    }
  }

  const stage = getStage(focus?.academic?.stageId);
  const course = useData.getState().courses.find((c) => c.id === focus?.academic?.courseId);

  return {
    focus,
    related: related.slice(0, 40),
    academic: { stage: stage?.name, year: stage?.academicYear, course: course?.title },
    history: [],
  };
}

/** Render a retrieval result as prompt-ready text for an AI provider. */
export function formatForAi(result: RetrieveResult): string {
  if (!result.total) return 'No matching records found in the student\'s data.';
  const lines: string[] = [];
  for (const g of result.groups) {
    lines.push(`${g.icon} ${g.label.toUpperCase()} (${g.records.length})`);
    for (const r of g.records) {
      lines.push(`- ${r.title}${r.academicLabel ? ` [${r.academicLabel}]` : ''}${r.date ? ` (${r.date})` : ''}${r.summary ? `: ${r.summary}` : ''}`);
      if (r.relationships?.length) {
        lines.push(`  related: ${r.relationships.slice(0, 8).map((x) => `${x.type}:${x.title || x.id}`).join(', ')}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Diagnostics for the Settings/dev view: what the layer can currently see. */
export function intelligenceStats(): Array<{ key: string; label: string; icon: string; count: number; domain: string }> {
  return listSources().map((s) => {
    let count = 0;
    try {
      count = s.list().length;
    } catch {
      count = 0;
    }
    return { key: s.key, label: s.label, icon: s.icon, count, domain: s.domain };
  });
}
