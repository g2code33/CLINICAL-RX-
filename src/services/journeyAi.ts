import { useData, uid } from '../stores/data';
import type {
  Achievement, Certification, ClinicalExperience, Course, Goal, LeadershipRole,
  Project, ResearchItem, Skill, WardRound, WardEntry,
} from '../types';

/**
 * AI layer for the PharmD Journey modes. Mirrors the ward-round pattern:
 *   - Each Journey mode can discuss the WHOLE section OR a specific record.
 *   - When a record is picked, the AI gets a rich dump of that record plus its
 *     linked evidence (ward rounds, courses, skills, projects, etc.) injected
 *     into the system prompt via a `LOADED RECORD DATA` block — exactly like
 *     wardround does for rounds/patients.
 *   - Chat sessions are keyed as `[j:<mode>:<recId>]` (section-wide) or
 *     `[j:<mode>]` (all-of-section), reused so returning to the same record
 *     continues the conversation.
 *
 * All Journey modes still run on the 'career' module — ONE shared brain across
 * clinical + journey, the same fullAppContext and same memory. This file just
 * builds the per-record/section context payload.
 */

export type JourneyFocus =
  | 'journey' | 'timeline' | 'experience' | 'skills' | 'projects'
  | 'research' | 'leadership' | 'achievements' | 'certifications'
  | 'goals' | 'portfolio' | 'archive' | 'courses' | 'progress';

export interface JourneyPickOption {
  id: string;                // record id, or special sentinel 'section'
  label: string;
  sub?: string;
  meta?: string;             // small right-aligned meta (date, count)
  badge?: string;            // coloured pill text (e.g. "⭐ Portfolio")
}

const SECTION_META: Record<JourneyFocus, {
  icon: string;
  singular: string;
  plural: string;
  module?: 'clinicalExperience' | 'skill' | 'achievement' | 'certification'
         | 'project' | 'research' | 'leadership' | 'goal' | 'course';
  sectionLabel: string;
}> = {
  journey:      { icon: '🎓', singular: 'Journey snapshot', plural: 'Journey',       sectionLabel: 'Your whole PharmD Journey' },
  timeline:     { icon: '📈', singular: 'Timeline entry',     plural: 'Timeline',      sectionLabel: 'Your academic & professional timeline' },
  experience:   { icon: '🏥', singular: 'rotation / placement', plural: 'Clinical experience', module: 'clinicalExperience', sectionLabel: 'Your clinical experience / rotations' },
  skills:       { icon: '🧠', singular: 'skill',             plural: 'Skills',         module: 'skill', sectionLabel: 'Your recorded competencies & evidence' },
  projects:     { icon: '💻', singular: 'project',           plural: 'Projects',       module: 'project', sectionLabel: 'Your projects' },
  research:     { icon: '🔬', singular: 'research item',     plural: 'Research',       module: 'research', sectionLabel: 'Your research interests & outputs' },
  leadership:   { icon: '🏅', singular: 'leadership role',   plural: 'Leadership',     module: 'leadership', sectionLabel: 'Your leadership & activities' },
  achievements: { icon: '🏆', singular: 'achievement',       plural: 'Achievements',   module: 'achievement', sectionLabel: 'Your achievements & awards' },
  certifications:{icon: '📜', singular: 'certification',     plural: 'Certifications', module: 'certification', sectionLabel: 'Your certifications & credentials' },
  goals:        { icon: '🎯', singular: 'goal',              plural: 'Goals',          module: 'goal', sectionLabel: 'Your goals & milestones' },
  portfolio:    { icon: '📁', singular: 'portfolio entry',   plural: 'Portfolio',      sectionLabel: 'Your public portfolio' },
  archive:      { icon: '📚', singular: 'archived level',    plural: 'Archive',        sectionLabel: 'Your academic archive' },
  courses:      { icon: '📘', singular: 'course',            plural: 'Courses',        module: 'course', sectionLabel: 'Your courses' },
  progress:     { icon: '📊', singular: 'Progress snapshot', plural: 'Progress',       sectionLabel: 'Your overall progress' },
};

/** Plural/singular label and icon for a journey focus. */
export function journeyMeta(f: JourneyFocus) { return SECTION_META[f]; }

/** Parse a title-embedded tag `[j:experience:abc123]` → { focus, recordId }. */
export function parseJourneyTag(title: string | undefined): { focus: JourneyFocus; recordId: string | null } | null {
  if (!title) return null;
  const m = /^\[j:([a-z]+)(?::([^\]]+))?\]/.exec(title);
  if (!m) return null;
  const focus = m[1] as JourneyFocus;
  if (!(focus in SECTION_META)) return null;
  return { focus, recordId: m[2] || null };
}

/** Build the title prefix for a session key. */
export function journeyTag(focus: JourneyFocus, recordId?: string | null): string {
  return recordId ? `[j:${focus}:${recordId}]` : `[j:${focus}]`;
}

/** List the pickable records for the given focus. */
export function listJourneyRecords(focus: JourneyFocus): JourneyPickOption[] {
  const st = useData.getState();
  const out: JourneyPickOption[] = [];
  switch (focus) {
    case 'experience':
      for (const r of st.clinicalExperiences) {
        const date = r.endDate ? `${r.startDate} → ${r.endDate}` : r.startDate;
        const rounds = (r.relatedRoundIds || []).length;
        out.push({
          id: r.id,
          label: r.title,
          sub: [r.clinicalArea, r.institution].filter(Boolean).join(' · '),
          meta: [date, rounds ? `${rounds} round${rounds === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'skills':
      for (const r of st.skills) {
        const conf = '●'.repeat(r.confidence) + '○'.repeat(5 - r.confidence);
        out.push({
          id: r.id,
          label: r.title,
          sub: r.category,
          meta: `${conf}  ${(r.evidence || []).length} evidence`,
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'projects':
      for (const r of st.projects) {
        const date = r.endDate || r.startDate;
        out.push({
          id: r.id,
          label: r.title,
          sub: [r.role, r.status].filter(Boolean).join(' · '),
          meta: date || '',
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'research':
      for (const r of st.research) {
        out.push({
          id: r.id,
          label: r.title,
          sub: [r.kind, r.topic, r.venue].filter(Boolean).join(' · '),
          meta: r.authors || r.startDate || '',
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'leadership':
      for (const r of st.leadership) {
        const date = r.endDate ? `${r.startDate} → ${r.endDate}` : r.startDate;
        out.push({
          id: r.id,
          label: r.position,
          sub: r.organization,
          meta: date,
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'achievements':
      for (const r of st.achievements) {
        out.push({
          id: r.id,
          label: r.title,
          sub: r.category,
          meta: r.date,
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'certifications':
      for (const r of st.certifications) {
        const exp = r.expiryDate ? `exp ${r.expiryDate}` : '';
        out.push({
          id: r.id,
          label: r.title,
          sub: r.issuer || r.category,
          meta: [r.dateObtained, exp].filter(Boolean).join(' · '),
          badge: r.visibility === 'portfolio' ? '⭐ Portfolio' : undefined,
        });
      }
      break;
    case 'goals':
      for (const r of st.goals) {
        const total = r.milestones?.length || 0;
        const done = r.milestones?.filter((m) => m.done).length || 0;
        out.push({
          id: r.id,
          label: r.title,
          sub: r.category,
          meta: `${r.status}${total ? ` · ${done}/${total} milestones` : ''}${r.targetDate ? ` · → ${r.targetDate}` : ''}`,
        });
      }
      break;
    case 'courses':
      for (const r of st.courses) {
        out.push({
          id: r.id,
          label: r.title,
          sub: [r.code, r.note].filter(Boolean).join(' · '),
          meta: r.credits ? `${r.credits} credits` : '',
        });
      }
      break;
    default:
      // journey / timeline / portfolio / archive / progress are section-wide summaries
      break;
  }
  return out;
}

/** Resolve the raw record from a focus + id. */
export function getJourneyRecord(focus: JourneyFocus, recordId: string): any | null {
  const st = useData.getState();
  switch (focus) {
    case 'experience':   return st.clinicalExperiences.find((r) => r.id === recordId) ?? null;
    case 'skills':       return st.skills.find((r) => r.id === recordId) ?? null;
    case 'projects':     return st.projects.find((r) => r.id === recordId) ?? null;
    case 'research':     return st.research.find((r) => r.id === recordId) ?? null;
    case 'leadership':   return st.leadership.find((r) => r.id === recordId) ?? null;
    case 'achievements': return st.achievements.find((r) => r.id === recordId) ?? null;
    case 'certifications': return st.certifications.find((r) => r.id === recordId) ?? null;
    case 'goals':        return st.goals.find((r) => r.id === recordId) ?? null;
    case 'courses':      return st.courses.find((r) => r.id === recordId) ?? null;
    default: return null;
  }
}

/** Safe JSON stringify, truncating long strings. */
function dump(obj: any): string {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function resolveEvidence(ev: Array<{ type: string; id: string; label?: string; note?: string }> | undefined): string[] {
  if (!ev?.length) return [];
  const st = useData.getState();
  const lines: string[] = [];
  for (const e of ev) {
    let rec: any = null;
    const tryFind = (list: any[]) => list?.find((x) => x.id === e.id) ?? null;
    switch (e.type) {
      case 'wardRound': rec = tryFind(st.wardRounds); break;
      case 'clinicalExperience': rec = tryFind(st.clinicalExperiences); break;
      case 'skill': rec = tryFind(st.skills); break;
      case 'project': rec = tryFind(st.projects); break;
      case 'research': rec = tryFind(st.research); break;
      case 'course': rec = tryFind(st.courses); break;
      case 'achievement': rec = tryFind(st.achievements); break;
      case 'certification': rec = tryFind(st.certifications); break;
      case 'leadership': rec = tryFind(st.leadership); break;
      case 'goal': rec = tryFind(st.goals); break;
      case 'lesson': rec = tryFind(st.lessons); break;
      default: break;
    }
    const title = rec?.title || rec?.ward || rec?.name || e.label || e.id.slice(0, 8);
    lines.push(`  - [${e.type}] ${title}${e.note ? ` — ${e.note}` : ''}`);
  }
  return lines;
}

function listRoundsForExperience(rec: ClinicalExperience): WardRound[] {
  const st = useData.getState();
  const ids = new Set(rec.relatedRoundIds || []);
  return st.wardRounds.filter((r) => ids.has(r.id));
}

function listEntriesForRounds(roundIds: string[]): WardEntry[] {
  const st = useData.getState();
  const ids = new Set(roundIds);
  return st.wardEntries.filter((e) => ids.has(e.roundId));
}

/**
 * Build the rich system-context block for a single loaded journey record, in
 * the same style as wardround's LOADED ROUND DATA. Always returns an empty
 * string if the record isn't found or the focus is section-wide.
 */
export function buildJourneyRecordContext(focus: JourneyFocus, recordId: string): string {
  const rec = getJourneyRecord(focus, recordId);
  if (!rec) return '';
  const meta = SECTION_META[focus];
  const out: string[] = [];
  out.push(`=== LOADED ${meta.singular.toUpperCase()} (${focus}) ===`);
  out.push(dump(clean(rec)));

  // Cross-linked context per type
  switch (focus) {
    case 'experience': {
      const rounds = listRoundsForExperience(rec as ClinicalExperience);
      if (rounds.length) {
        out.push('');
        out.push(`=== LINKED WARD ROUNDS (${rounds.length}) ===`);
        for (const r of rounds) {
          const entries = listEntriesForRounds([r.id]);
          const counts: Record<string, number> = {};
          for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
          out.push(`• ${r.ward} · ${r.date}${r.focus ? ` · ${r.focus}` : ''} (${entries.length} captures: ${Object.entries(counts).map(([k,v])=>`${k}:${v}`).join(', ')})`);
          if (r.reflection) out.push(`  Reflection: ${r.reflection.slice(0, 600)}`);
        }
      }
      break;
    }
    case 'skills': {
      const evidence = resolveEvidence((rec as Skill).evidence);
      if (evidence.length) {
        out.push('');
        out.push('=== EVIDENCE ATTACHED TO THIS SKILL ===');
        evidence.forEach((l) => out.push(l));
      }
      break;
    }
    case 'projects':
    case 'leadership':
    case 'achievements':
    case 'certifications':
    case 'goals':
    case 'research': {
      const evidence = resolveEvidence((rec as any).evidence);
      if (evidence.length) {
        out.push('');
        out.push('=== LINKED EVIDENCE ===');
        evidence.forEach((l) => out.push(l));
      }
      break;
    }
    default: break;
  }
  return out.join('\n');
}

function clean(rec: any): any {
  // Strip noisy/system fields not useful to the AI.
  const { id, createdAt, updatedAt, ...rest } = rec || {};
  return { id, ...rest };
}

/** Section-wide summary context (used when nothing is picked; mirrors the
 *  existing "starter" scope). */
export function buildJourneySectionContext(focus: JourneyFocus): string {
  const st = useData.getState();
  const meta = SECTION_META[focus];
  const out: string[] = [];
  out.push(`=== SECTION OVERVIEW: ${meta.sectionLabel} ===`);
  const count = (arr: any[]) => arr.filter((r) => !r.archived).length;
  const counts: Record<string, number> = {
    experience: count(st.clinicalExperiences),
    skills: count(st.skills),
    projects: count(st.projects),
    research: count(st.research),
    leadership: count(st.leadership),
    achievements: count(st.achievements),
    certifications: count(st.certifications),
    goals: count(st.goals),
    courses: count(st.courses),
    wardRounds: count(st.wardRounds),
  };
  out.push('Counts: ' + Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', '));
  return out.join('\n');
}

/** Default opener prompt when a record is first loaded (mirrors wardround). */
export function journeyOpener(focus: JourneyFocus, rec: any | null): string {
  const meta = SECTION_META[focus];
  if (!rec) {
    return `Give me a concise overview of my ${meta.plural.toLowerCase()}: top highlights, gaps I should address, and 3 actionable next steps. Reference only what I have recorded.`;
  }
  switch (focus) {
    case 'experience':
      return `Walk me through this rotation (${rec.title}). Summarise what I experienced, the strongest STAR-format story I could tell in an interview, what is thin or missing from this entry, key clinical-pharmacy learning points, and 3 reflective questions I should answer to strengthen it. Reference the linked ward rounds where relevant.`;
    case 'skills':
      return `Review this skill (${rec.title}). Tell me if the confidence rating looks justified by the attached evidence, what evidence I could add to strengthen it, and how to talk about this skill convincingly in an interview (1–2 bullet examples).`;
    case 'projects':
      return `Walk me through this project (${rec.title}). Suggest strong STAR-format CV bullets, point out what's thin (outcomes? technologies? impact?), and 2 talking points I could use in an interview.`;
    case 'research':
      return `Review this research item (${rec.title}). Suggest realistic next steps, any gaps between what I've recorded and a strong student-research narrative, and interview talking points.`;
    case 'leadership':
      return `Review this leadership role (${rec.position} @ ${rec.organization}). Suggest strong CV bullets, and ask me 3 reflective questions that surface concrete impact I haven't written down yet.`;
    case 'achievements':
      return `Review this achievement (${rec.title}). Tell me how to phrase it in CV/interview language and what category it falls under. Suggest if anything is missing that would make it more credible.`;
    case 'certifications':
      return `Review this certification (${rec.title}). Tell me how to list it on a CV, flag upcoming expiry if applicable, and suggest 1–2 complementary credentials that would fit my journey.`;
    case 'goals':
      return `Review this goal (${rec.title}). Assess realism vs stretch, suggest next milestones if progress looks stalled, and flag any timeline conflicts with other parts of my journey.`;
    case 'courses':
      return `Review this course (${rec.title}). Suggest how what I'm learning ties to my skills, projects and portfolio, and which topics would make strong CV evidence or interview stories.`;
    default:
      return `Give me a focused walkthrough of this ${meta.singular} (${rec.title || ''}): key points, gaps, and 3 follow-up questions I should be able to answer. Reference only what I have recorded.`;
  }
}

/**
 * Open (or create) the chat session for a Journey focus + optional record.
 * Mirrors openRoundAi's behaviour: tagged title, reused session, seeded
 * context, opening AI response if brand-new.
 */
export async function openJourneyAi(
  focus: JourneyFocus,
  recordId?: string | null,
  kickoffPrompt?: string,
): Promise<{ sessionId: string; modeKey: string }> {
  const st = useData.getState();
  const rec = recordId ? getJourneyRecord(focus, recordId) : null;
  if (recordId && !rec) throw new Error('Record not found');
  const now = Date.now();
  const modeKey = `j:${focus}`;
  const tag = journeyTag(focus, recordId || null);
  const meta = SECTION_META[focus];
  const label = rec
    ? `${meta.icon} ${rec.title || rec.position || rec.name || meta.singular}`
    : `${meta.icon} ${meta.sectionLabel}`;
  const title = `${tag} ${label}`;

  let session = st.chats.find((c) => c.section === 'career' && c.title?.startsWith(tag));
  if (!session) {
    session = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      section: 'career',
      title,
      messages: [],
      hidden: false,
    };
  }

  const isBrandNew = (session.messages?.length ?? 0) === 0;
  if (isBrandNew) {
    const ctx = rec
      ? buildJourneyRecordContext(focus, recordId!)
      : buildJourneySectionContext(focus);
    const scopeLine = rec
      ? `I'm opening Journey AI focused on ${meta.singular} "${rec.title || rec.position || rec.name}" in the ${meta.plural} section.`
      : `I'm opening Journey AI to discuss my ${meta.plural.toLowerCase()} as a whole.`;
    const seed = [
      scopeLine,
      rec
        ? `Here is everything saved about this specific record. Use it to teach me, critique my entry, suggest CV/interview phrasing, surface gaps, and tie in linked evidence. Stay grounded ONLY in what I have recorded; flag anything missing.`
        : `Here is an overview of my data for this section. Stay grounded ONLY in what I have recorded.`,
      '',
      ctx,
    ].join('\n');
    session.messages = [
      ...(session.messages ?? []),
      { id: uid(), role: 'user' as const, text: seed, ts: now },
    ];
    await st.save('chat', session);

    const opener = kickoffPrompt || journeyOpener(focus, rec);
    try {
      const { runAiModule, getEffectiveAiConfig } = await import('./aiTools');
      const cfg = getEffectiveAiConfig('career');
      if (cfg && cfg.enabled && cfg.apiKey) {
        const systemExtra = rec
          ? `FOCUS: the single ${meta.singular} loaded above. Every response must reference that specific record (not generic advice). Point out concrete strengths, concrete gaps, and concrete next steps. Do not invent data.`
          : `FOCUS: the student's ${meta.plural.toLowerCase()} as a whole.`;
        const history = session.messages.slice(-13, -1).map((m) => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.text,
        }));
        const res = await runAiModule('career', opener, systemExtra, { history });
        if (res.ok) {
          await st.save('chat', {
            ...session,
            messages: [...session.messages, { id: uid(), role: 'ai' as const, text: res.text, ts: Date.now() }],
            updatedAt: Date.now(),
          });
        }
      }
    } catch { /* AI not configured — empty chat is fine */ }
  } else if (kickoffPrompt) {
    await st.save('chat', {
      ...session,
      messages: [...(session.messages ?? []), { id: uid(), role: 'user' as const, text: kickoffPrompt, ts: now }],
      updatedAt: now,
    });
  }

  return { sessionId: session.id, modeKey };
}
