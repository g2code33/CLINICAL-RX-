import { useData, uid } from '../stores/data';
import {
  newDisease,
  newInvestigation,
  newLesson,
  newMedicine,
  newQuestion,
  newWardEntry,
  newWardRound,
  todayIso,
  WARD_ENTRY_META,
} from './defaults';
import type { WardAnalysis, WardEntry, WardEntryType, WardRound } from '../types';

/**
 * Ward Rounds — capture clinical LEARNING during an active ward round.
 *
 * Design rules (enforced throughout this module):
 *  - No patient data. Nothing here models a patient; entries describe what the
 *    student encountered and learned.
 *  - Offline-first. Every function below writes through the existing storage
 *    adapter (SQLite on desktop, localStorage on web) and never requires the
 *    network. AI is strictly additive.
 *  - The student's own words are immutable to AI: `WardEntry.content` is only
 *    ever changed by the student. AI output lives in `wardAnalysis` records or
 *    in the separate `aiSuggestion` field.
 */

export const ENTRY_TYPES: WardEntryType[] = ['learning', 'medicine', 'condition', 'investigation', 'question', 'note'];

// ---- Reads -------------------------------------------------------------

export function getRound(roundId: string): WardRound | null {
  return useData.getState().wardRounds.find((r) => r.id === roundId) ?? null;
}

export function entriesFor(roundId: string): WardEntry[] {
  return useData
    .getState()
    .wardEntries.filter((e) => e.roundId === roundId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function analysisFor(roundId: string): WardAnalysis | null {
  const list = useData.getState().wardAnalyses.filter((a) => a.roundId === roundId);
  if (!list.length) return null;
  return list.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/** The round currently in progress, if any (most recently started). */
export function activeRound(): WardRound | null {
  const active = useData.getState().wardRounds.filter((r) => r.status === 'active' && !r.archived);
  if (!active.length) return null;
  return active.sort((a, b) => b.startedAt - a.startedAt)[0];
}

export type WardCounts = Record<WardEntryType, number> & { total: number };

export function countsFor(roundId: string): WardCounts {
  const counts = { total: 0 } as WardCounts;
  for (const t of ENTRY_TYPES) counts[t] = 0;
  for (const e of entriesFor(roundId)) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    counts.total++;
  }
  return counts;
}

/** Human-readable one-line summary of what a round contains. */
export function countsSummary(counts: WardCounts): string {
  return ENTRY_TYPES.filter((t) => counts[t] > 0)
    .map((t) => `${counts[t]} ${counts[t] === 1 ? WARD_ENTRY_META[t].label : WARD_ENTRY_META[t].plural}`)
    .join(' · ');
}

// ---- Rounds ------------------------------------------------------------

export async function startRound(ward: string, date: string, focus: string): Promise<WardRound> {
  const st = useData.getState();
  const round = newWardRound(ward.trim() || 'Ward', date || todayIso(), focus.trim() || 'General');
  // Stamp the academic context (stage / semester / year) so this round stays
  // attributable to the right point in the user's journey forever.
  try {
    const { currentAcademicLink } = await import('./academic');
    const link = currentAcademicLink();
    if (link.stageId || link.academicYear) round.academic = link;
  } catch { /* academic module optional */ }
  // Link to the clinical day with the same date when one exists, so the
  // bundlers and Clinical Days page can relate them without duplicating data.
  const day = st.days.find((d) => d.date === round.date);
  if (day) round.dayId = day.id;
  await st.save('wardRound', round);
  st.setStatus(`🏥 Ward round started — ${round.ward}`);
  return round;
}

export async function updateRound(round: WardRound, patch: Partial<WardRound>): Promise<void> {
  await useData.getState().save('wardRound', { ...round, ...patch });
}

export async function renameRound(roundId: string, ward: string): Promise<void> {
  const round = getRound(roundId);
  if (!round) return;
  await updateRound(round, { ward: ward.trim() || round.ward });
}

export async function setArchived(roundId: string, archived: boolean): Promise<void> {
  const round = getRound(roundId);
  if (!round) return;
  await updateRound(round, { archived });
}

/** Finish a round. Purely local — AI is optional and handled separately. */
export async function finishRound(roundId: string): Promise<WardRound | null> {
  const round = getRound(roundId);
  if (!round) return null;
  const done: WardRound = { ...round, status: 'completed', completedAt: Date.now() };
  await useData.getState().save('wardRound', done);
  // Push captured learning into the main compartments so a ward round
  // contributes to Diseases / Medicines / Investigations / Questions exactly
  // like a clinical day does.
  await syncRoundToCompartments(roundId);
  useData.getState().setStatus('✓ Ward round saved');
  return done;
}

export async function reopenRound(roundId: string): Promise<void> {
  const round = getRound(roundId);
  if (!round) return;
  await updateRound(round, { status: 'active', completedAt: undefined });
}

/** Delete a round together with its entries and AI analyses. */
export async function deleteRound(roundId: string): Promise<void> {
  const st = useData.getState();
  for (const e of st.wardEntries.filter((e) => e.roundId === roundId)) {
    await st.remove('wardEntry', e.id);
  }
  for (const a of st.wardAnalyses.filter((a) => a.roundId === roundId)) {
    await st.remove('wardAnalysis', a.id);
  }
  await st.remove('wardRound', roundId);
  st.setStatus('✓ Ward round deleted');
}

// ---- Entries -----------------------------------------------------------

export async function addEntry(
  roundId: string,
  type: WardEntryType,
  title: string,
  content: string,
  priority: WardEntry['priority'] = 'medium'
): Promise<WardEntry | null> {
  const text = content.trim();
  const name = title.trim();
  // A capture needs *something* — either a subject or a body.
  if (!text && !name) return null;
  const entry = newWardEntry(roundId, type, name, text);
  entry.priority = priority;
  await useData.getState().save('wardEntry', entry);
  return entry;
}

export async function updateEntry(entry: WardEntry, patch: Partial<WardEntry>): Promise<void> {
  await useData.getState().save('wardEntry', { ...entry, ...patch });
}

export async function deleteEntry(entryId: string): Promise<void> {
  await useData.getState().remove('wardEntry', entryId);
}

/** Label shown on a capture card. Falls back to the first line of content. */
export function entryHeading(e: WardEntry): string {
  if (e.title) return e.title;
  const firstLine = (e.content || '').split('\n')[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine || WARD_ENTRY_META[e.type].label;
}

// ---- Compartment integration ------------------------------------------

/**
 * Push a round's captures into the main clinical compartments, mirroring
 * `daySync` for clinical days. Existing records (matched by name) are reused
 * rather than duplicated, and the ward entry keeps a reference to the record.
 */
export async function syncRoundToCompartments(roundId: string): Promise<{ created: number }> {
  const st = useData.getState();
  const round = getRound(roundId);
  if (!round) return { created: 0 };
  const entries = entriesFor(roundId);
  let created = 0;

  for (const e of entries) {
    const name = (e.title || e.content).trim();
    if (!name) continue;
    const lower = name.toLowerCase();

    if (e.type === 'medicine') {
      const existing = st.medicines.find((m) => m.name.toLowerCase() === lower);
      if (existing) {
        if (!e.linkedRecordId) await updateEntry(e, { linkedRecordId: existing.id });
        continue;
      }
      const rec = newMedicine(name);
      rec.lastSeen = round.date;
      await st.save('medicine', rec);
      await updateEntry(e, { linkedRecordId: rec.id });
      created++;
    } else if (e.type === 'condition') {
      const existing = st.diseases.find((d) => d.name.toLowerCase() === lower);
      if (existing) {
        if (!e.linkedRecordId) await updateEntry(e, { linkedRecordId: existing.id });
        continue;
      }
      const rec = newDisease(name);
      rec.lastSeen = round.date;
      await st.save('disease', rec);
      await updateEntry(e, { linkedRecordId: rec.id });
      created++;
    } else if (e.type === 'investigation') {
      const existing = st.investigations.find((i) => i.name.toLowerCase() === lower);
      if (existing) {
        if (!e.linkedRecordId) await updateEntry(e, { linkedRecordId: existing.id });
        continue;
      }
      const rec = newInvestigation(name);
      rec.lastSeen = round.date;
      await st.save('investigation', rec);
      await updateEntry(e, { linkedRecordId: rec.id });
      created++;
    } else if (e.type === 'question') {
      const text = e.content || e.title;
      if (!text.trim()) continue;
      if (st.questions.some((q) => q.text.toLowerCase() === text.toLowerCase())) continue;
      const rec = newQuestion(text);
      rec.priority = e.priority;
      await st.save('question', rec);
      await updateEntry(e, { linkedRecordId: rec.id });
      created++;
    } else if (e.type === 'learning') {
      const text = e.content || e.title;
      if (!text.trim()) continue;
      if (st.lessons.some((l) => l.title.toLowerCase() === text.toLowerCase())) continue;
      const rec = newLesson(text, round.date);
      await st.save('lesson', rec);
      await updateEntry(e, { linkedRecordId: rec.id });
      created++;
    }
  }

  if (created) st.setStatus(`✓ Added ${created} item(s) from the ward round to your compartments`);
  return { created };
}

// ---- Search ------------------------------------------------------------

export interface WardSearchHit {
  round: WardRound;
  entries: WardEntry[];
}

/**
 * Search across ward rounds AND their entries. Matching a ward name, focus or
 * date returns the round; matching entry text returns the round with the
 * matching entries attached.
 */
export function searchWardRounds(query: string): WardSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const st = useData.getState();
  const hits: WardSearchHit[] = [];
  for (const round of st.wardRounds) {
    const roundMatch =
      round.ward.toLowerCase().includes(q) ||
      round.date.toLowerCase().includes(q) ||
      (round.focus || '').toLowerCase().includes(q);
    const entries = st.wardEntries.filter(
      (e) => e.roundId === round.id && (e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
    );
    if (roundMatch || entries.length) hits.push({ round, entries });
  }
  return hits.sort((a, b) => (a.round.date < b.round.date ? 1 : -1));
}

// ---- Aggregation for bundles ------------------------------------------

export interface WardRoundDigest {
  id: string;
  ward: string;
  date: string;
  focus: string;
  status: WardRound['status'];
  counts: WardCounts;
  learning: string[];
  medicines: string[];
  conditions: string[];
  investigations: string[];
  questions: string[];
  notes: string[];
}

function textsOf(entries: WardEntry[], type: WardEntryType): string[] {
  return entries
    .filter((e) => e.type === type)
    .map((e) => (e.title && e.content ? `${e.title} — ${e.content}` : e.title || e.content))
    .filter(Boolean);
}

/** Compact, reference-friendly view of a round used by the bundlers. */
export function digestRound(round: WardRound): WardRoundDigest {
  const entries = entriesFor(round.id);
  return {
    id: round.id,
    ward: round.ward,
    date: round.date,
    focus: round.focus,
    status: round.status,
    counts: countsFor(round.id),
    learning: textsOf(entries, 'learning'),
    medicines: textsOf(entries, 'medicine'),
    conditions: textsOf(entries, 'condition'),
    investigations: textsOf(entries, 'investigation'),
    questions: textsOf(entries, 'question'),
    notes: textsOf(entries, 'note'),
  };
}

/** Rounds whose date falls inside [start, end] (inclusive). */
export function roundsInRange(start: string, end: string): WardRound[] {
  return useData
    .getState()
    .wardRounds.filter((r) => r.date >= start && r.date <= end && !r.archived)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Export helpers ----------------------------------------------------

export function roundToMarkdown(round: WardRound): string {
  const entries = entriesFor(round.id);
  const lines: string[] = [];
  lines.push(`# 🏥 Ward Round — ${round.ward}`);
  lines.push('');
  lines.push(`**Date:** ${round.date}  `);
  if (round.focus) lines.push(`**Focus:** ${round.focus}  `);
  lines.push(`**Status:** ${round.status}`);
  lines.push('');
  for (const type of ENTRY_TYPES) {
    const items = entries.filter((e) => e.type === type);
    if (!items.length) continue;
    const meta = WARD_ENTRY_META[type];
    lines.push(`## ${meta.icon} ${meta.plural}`);
    lines.push('');
    for (const e of items) {
      lines.push(e.title && e.content ? `- **${e.title}** — ${e.content}` : `- ${e.title || e.content}`);
    }
    lines.push('');
  }
  const analysis = analysisFor(round.id);
  if (analysis && analysis.status === 'completed') {
    lines.push('---');
    lines.push('');
    lines.push('## 🤖 AI analysis');
    lines.push('');
    lines.push('_AI-generated. Your original notes above are unchanged._');
    lines.push('');
    if (analysis.summary) {
      lines.push(analysis.summary);
      lines.push('');
    }
    const sections: Array<[string, string[]]> = [
      ['Key learning points', analysis.keyLearningPoints],
      ['Knowledge gaps', analysis.knowledgeGaps],
      ['Follow-up questions', analysis.questions],
      ['Revision recommendations', analysis.revisionRecommendations],
      ['Connections', analysis.connections],
      ['Topics needing deeper study', analysis.difficultTopics],
    ];
    for (const [heading, items] of sections) {
      if (!items.length) continue;
      lines.push(`### ${heading}`);
      lines.push('');
      items.forEach((i) => lines.push(`- ${i}`));
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** Duplicate a round (entries included) — useful for recurring ward templates. */
export async function duplicateRound(roundId: string): Promise<WardRound | null> {
  const round = getRound(roundId);
  if (!round) return null;
  const st = useData.getState();
  const now = Date.now();
  const copy: WardRound = {
    ...round,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    status: 'active',
    startedAt: now,
    completedAt: undefined,
    date: todayIso(),
  };
  await st.save('wardRound', copy);
  for (const e of entriesFor(roundId)) {
    await st.save('wardEntry', { ...e, id: uid(), roundId: copy.id, createdAt: Date.now(), updatedAt: Date.now() });
  }
  return copy;
}
