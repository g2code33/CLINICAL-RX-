import { useData } from '../stores/data';
import { allStages, getStage } from './academic';
import {
  CONFIDENCE_LABEL,
  exportableRecords,
  goalProgress,
  portfolioRecords,
  professionalTimeline,
  resolveEvidence,
  skillsByCategory,
} from './career';
import type { Certification, Skill } from '../types';

/**
 * 📁 PROFESSIONAL PORTFOLIO + 📄 CV FOUNDATION (Phase 6)
 *
 * Assembles a professional profile from records the student has EXPLICITLY
 * marked portfolio-visible.
 *
 * Hard rules enforced here:
 *   - PRIVATE records never appear in any output.
 *   - Nothing is embellished. Every line traces to a stored record.
 *   - Sensitive fields (credential/reference numbers) are never exported.
 *   - AI-written wording is always labelled for review before use.
 */

export const AI_REVIEW_NOTICE = 'AI GENERATED — REVIEW BEFORE USE';

// ---- Sensitive-field policy -------------------------------------------

/**
 * Fields that must never leave the app in an export.
 * Certification credential numbers are personal identifiers.
 */
const SENSITIVE_FIELDS = new Set(['credentialId', 'apiKey', 'attachmentRef']);

function safeCert(c: Certification): Omit<Certification, 'credentialId'> {
  const { credentialId: _omit, ...rest } = c;
  return rest;
}

export function stripSensitive<T extends Record<string, any>>(rec: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) if (!SENSITIVE_FIELDS.has(k)) out[k] = v;
  return out as T;
}

// ---- Portfolio ---------------------------------------------------------

export interface PortfolioGroup {
  module: string;
  label: string;
  icon: string;
  records: any[];
}

/** Portfolio-visible records only, with sensitive fields removed. */
export function portfolioView(): PortfolioGroup[] {
  return portfolioRecords().map((g) => ({
    module: String(g.module),
    label: g.label,
    icon: g.icon,
    records: g.records.map(stripSensitive),
  }));
}

function fmtDate(d?: string): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return m ? `${months[Number(m) - 1] ?? ''} ${y}`.trim() : y;
}

function range(from?: string, to?: string): string {
  if (!from && !to) return '';
  return `${fmtDate(from)} – ${to ? fmtDate(to) : 'present'}`;
}

/** Render one record as a portfolio bullet. */
function line(module: string, r: any): string {
  switch (module) {
    case 'clinicalExperience':
      return `- **${r.title}**${r.institution ? ` · ${r.institution}` : ''}${r.clinicalArea ? ` · ${r.clinicalArea}` : ''} (${range(r.startDate, r.endDate)})${r.description ? `\n  ${r.description}` : ''}`;
    case 'skill':
      return `- **${r.title}** — ${r.category}, self-rated ${r.confidence}/5 (${CONFIDENCE_LABEL[r.confidence] ?? ''})${(r.evidence ?? []).length ? ` · ${(r.evidence ?? []).length} evidence link(s)` : ''}`;
    case 'achievement':
      return `- **${r.title}** (${fmtDate(r.date)})${r.description ? ` — ${r.description}` : ''}`;
    case 'certification':
      return `- **${r.title}**${r.issuer ? ` · ${r.issuer}` : ''} (${fmtDate(r.dateObtained)}${r.expiryDate ? ` – expires ${fmtDate(r.expiryDate)}` : ''})`;
    case 'project':
      return `- **${r.title}**${r.role ? ` · ${r.role}` : ''} — ${r.status}${(r.technologies ?? []).length ? ` · ${(r.technologies ?? []).join(', ')}` : ''}${r.description ? `\n  ${r.description}` : ''}${r.outcomes ? `\n  Outcome: ${r.outcomes}` : ''}`;
    case 'research':
      return `- **${r.title}** (${r.kind})${r.venue ? ` · ${r.venue}` : ''}${r.description ? ` — ${r.description}` : ''}`;
    case 'leadership':
      return `- **${r.position}**, ${r.organization} (${range(r.startDate, r.endDate)})${(r.responsibilities ?? []).length ? `\n  ${(r.responsibilities ?? []).join('; ')}` : ''}`;
    case 'goal': {
      const p = goalProgress(r);
      return `- **${r.title}** — ${r.category}, ${r.status}${p.total ? ` (${p.done}/${p.total} milestones)` : ''}`;
    }
    default:
      return `- ${r.title ?? r.name ?? 'Untitled'}`;
  }
}

/** The portfolio as Markdown. Contains ONLY portfolio-visible records. */
export function portfolioToMarkdown(): string {
  const st = useData.getState();
  const profile = st.profile;
  const stage = getStage(profile?.currentStageId);
  const groups = portfolioView();

  const out: string[] = [
    `# Professional Portfolio — ${profile?.username ?? 'Student'}`,
    '',
    [profile?.programme, stage ? `${stage.name} (${stage.academicYear})` : null].filter(Boolean).join(' · '),
    '',
    `_Generated ${new Date().toLocaleDateString()} from records explicitly marked portfolio-visible._`,
    '',
  ];

  if (!groups.length) {
    out.push('No records have been added to the portfolio yet.', '');
    out.push('Open any professional record and set its visibility to **Portfolio** to include it here.');
    return out.join('\n');
  }

  for (const g of groups) {
    out.push(`## ${g.icon} ${g.label}`, '');
    for (const r of g.records) out.push(line(g.module, r));
    out.push('');
  }
  return out.join('\n');
}

/** Export-approved records only — a stricter subset than the portfolio. */
export function exportToMarkdown(): string {
  const groups = exportableRecords();
  if (!groups.length) return 'No records are marked for export.\n\nSet a record\'s visibility to **Export** to include it.';
  const out: string[] = ['# Professional Export', ''];
  for (const g of groups) {
    out.push(`## ${g.icon} ${g.label}`, '');
    for (const r of g.records) out.push(line(String(g.module), stripSensitive(r)));
    out.push('');
  }
  return out.join('\n');
}

// ---- CV foundation -----------------------------------------------------

export interface CvSection {
  key: string;
  heading: string;
  /** Editable lines — the user can reword before exporting. */
  lines: string[];
}

export interface Cv {
  name: string;
  headline: string;
  sections: CvSection[];
  /** Always shown; the CV is a draft assembled from records. */
  reviewNotice: string;
}

/**
 * Build a CV draft from portfolio-visible records.
 *
 * The wording is plain and factual — no superlatives, no invented claims. The
 * student edits it before export, which is why every section is a list of
 * editable strings rather than baked-in prose.
 */
export function buildCv(): Cv {
  const st = useData.getState();
  const profile = st.profile;
  const stage = getStage(profile?.currentStageId);
  const groups = new Map(portfolioView().map((g) => [g.module, g]));

  const pick = (module: string): any[] => groups.get(module)?.records ?? [];

  const education: string[] = allStages()
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => `${s.name} — ${s.academicYear}${s.institution ? ` · ${s.institution}` : ''}${s.status === 'current' ? ' (current)' : ''}`);

  const sections: CvSection[] = [
    {
      key: 'profile',
      heading: 'Profile',
      lines: [
        `${profile?.programme ?? 'Pharmacy'} student${stage ? ` currently at ${stage.name} (${stage.academicYear})` : ''}.`,
        'This summary is assembled from your own recorded activity. Edit the wording before you use it.',
      ],
    },
    { key: 'education', heading: 'Education', lines: education },
    {
      key: 'clinical',
      heading: 'Clinical Experience',
      lines: pick('clinicalExperience').map(
        (r) => `${r.title}${r.institution ? `, ${r.institution}` : ''} (${range(r.startDate, r.endDate)})`
      ),
    },
    {
      key: 'skills',
      heading: 'Skills',
      lines: pick('skill').map((r: Skill) => `${r.title} (${r.category}, ${CONFIDENCE_LABEL[r.confidence] ?? ''})`),
    },
    {
      key: 'projects',
      heading: 'Projects',
      lines: pick('project').map((r) => `${r.title}${r.role ? ` — ${r.role}` : ''} (${r.status})`),
    },
    {
      key: 'research',
      heading: 'Research',
      lines: pick('research').map((r) => `${r.title} (${r.kind})`),
    },
    {
      key: 'leadership',
      heading: 'Leadership',
      lines: pick('leadership').map((r) => `${r.position}, ${r.organization} (${range(r.startDate, r.endDate)})`),
    },
    {
      key: 'achievements',
      heading: 'Achievements',
      lines: pick('achievement').map((r) => `${r.title} (${fmtDate(r.date)})`),
    },
    {
      key: 'certifications',
      heading: 'Certifications',
      // Credential numbers are deliberately omitted.
      lines: pick('certification').map((r) => `${r.title}${r.issuer ? ` — ${r.issuer}` : ''} (${fmtDate(r.dateObtained)})`),
    },
  ];

  return {
    name: profile?.username ?? 'Student',
    headline: [profile?.programme, stage?.name].filter(Boolean).join(' · '),
    sections,
    reviewNotice: 'DRAFT — REVIEW BEFORE USE. Assembled from your stored records; verify every line.',
  };
}

export function cvToMarkdown(cv: Cv = buildCv()): string {
  const out: string[] = [`# ${cv.name}`, cv.headline, '', `_${cv.reviewNotice}_`, ''];
  for (const s of cv.sections) {
    if (!s.lines.length) continue;
    out.push(`## ${s.heading}`, '');
    for (const l of s.lines) out.push(`- ${l}`);
    out.push('');
  }
  return out.join('\n');
}

// ---- Career AI context -------------------------------------------------

/**
 * A compact, factual brief of the student's professional record.
 *
 * This is what Career AI is given. It contains ONLY counts and titles that
 * exist in the database, so the model has no room to invent an achievement —
 * and it includes private records because this never leaves the device unless
 * the user has enabled cloud AI (Phase 5 privacy rules apply).
 */
export function careerBrief(): string {
  const st = useData.getState();
  const stage = getStage(st.profile?.currentStageId);
  const out: string[] = [];

  out.push(`CURRENT STAGE: ${stage ? `${stage.name} (${stage.academicYear})` : 'not set'}`);
  out.push(`PROGRAMME: ${st.profile?.programme ?? 'unspecified'}`);
  out.push('');

  const stages = allStages();
  if (stages.length) {
    out.push('ACADEMIC JOURNEY:');
    for (const s of stages) out.push(`- ${s.name} (${s.academicYear}) — ${s.status}`);
    out.push('');
  }

  const exps = st.clinicalExperiences.filter((e) => !e.archived);
  if (exps.length) {
    out.push(`CLINICAL EXPERIENCE (${exps.length}):`);
    for (const e of exps) {
      out.push(`- ${e.title}${e.institution ? ` at ${e.institution}` : ''} (${range(e.startDate, e.endDate)})${e.clinicalArea ? ` · ${e.clinicalArea}` : ''}`);
    }
    out.push('');
  }

  const byCat = skillsByCategory();
  if (byCat.length) {
    out.push('SKILLS (self-rated by the student, 1–5):');
    for (const g of byCat) {
      out.push(`- ${g.label}: ${g.skills.map((s) => `${s.title} (${s.confidence}/5, ${(s.evidence ?? []).length} evidence)`).join('; ')}`);
    }
    out.push('');
  }

  const projects = st.projects.filter((p) => !p.archived);
  if (projects.length) {
    out.push(`PROJECTS (${projects.length}):`);
    for (const p of projects) {
      out.push(`- ${p.title} [${p.status}]${p.role ? ` · ${p.role}` : ''}${(p.technologies ?? []).length ? ` · tech: ${(p.technologies ?? []).join(', ')}` : ''}`);
    }
    out.push('');
  }

  const research = st.research.filter((r) => !r.archived);
  if (research.length) {
    out.push(`RESEARCH (${research.length}):`);
    for (const r of research) out.push(`- ${r.title} (${r.kind})${r.topic ? ` · ${r.topic}` : ''}`);
    out.push('');
  }

  const leadership = st.leadership.filter((l) => !l.archived);
  if (leadership.length) {
    out.push(`LEADERSHIP (${leadership.length}):`);
    for (const l of leadership) out.push(`- ${l.position}, ${l.organization} (${range(l.startDate, l.endDate)})`);
    out.push('');
  }

  const achievements = st.achievements.filter((a) => !a.archived);
  if (achievements.length) {
    out.push(`ACHIEVEMENTS (${achievements.length}):`);
    for (const a of achievements) out.push(`- ${a.title} (${fmtDate(a.date)}) · ${a.category}`);
    out.push('');
  }

  const certs = st.certifications.filter((c) => !c.archived);
  if (certs.length) {
    out.push(`CERTIFICATIONS (${certs.length}):`);
    // Credential numbers are never included in AI context.
    for (const c of certs.map(safeCert)) out.push(`- ${c.title}${c.issuer ? ` — ${c.issuer}` : ''} (${fmtDate(c.dateObtained)})`);
    out.push('');
  }

  const goals = st.goals.filter((g) => g.status !== 'archived');
  if (goals.length) {
    out.push(`GOALS (${goals.length}):`);
    for (const g of goals) {
      const p = goalProgress(g);
      out.push(`- ${g.title} [${g.status}] ${p.total ? `${p.done}/${p.total} milestones` : 'no milestones yet'}`);
    }
    out.push('');
  }

  if (out.filter((l) => l.startsWith('- ')).length === 0) {
    out.push('The student has not recorded any professional activity yet. Say so plainly rather than suggesting they have.');
  }

  return out.join('\n');
}

/** Evidence a record can point at, for the "attach evidence" picker. */
export function evidenceSummary(refs: any[]): string {
  const resolved = resolveEvidence(refs);
  if (!resolved.length) return 'No evidence attached yet.';
  return resolved.map((r) => `${r.exists ? '✓' : '⚠️'} ${r.display}`).join('\n');
}

/** Recent milestones for the professional timeline widget. */
export function recentMilestones(limit = 10) {
  return professionalTimeline(limit);
}
