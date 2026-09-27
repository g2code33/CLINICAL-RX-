import { useData } from '../stores/data';
import { newWardAnalysis, WARD_ENTRY_META } from './defaults';
import { aiReady, logAiTask, runAiModule } from './aiTools';
import { analysisFor, countsFor, digestRound, entriesFor, getRound } from './wardRounds';
import type { WardAnalysis, WardEntry, WardRound } from '../types';

/**
 * AI layer for Ward Rounds.
 *
 * Hard rule: AI output NEVER overwrites the student's captured learning.
 * Whole-round analysis is written to its own `wardAnalysis` record, and
 * per-entry suggestions land in `WardEntry.aiSuggestion` only after the
 * student explicitly accepts them. `WardEntry.content` stays untouched.
 */

/** Depth presets offered on the analysis screen and on Ask AI. */
export type ExplainMode = 'simple' | 'level' | 'deeper' | 'teach' | 'quiz';

export const EXPLAIN_MODES: Array<{ key: ExplainMode; label: string; hint: string }> = [
  { key: 'simple', label: 'Explain simply', hint: 'Plain language, no jargon' },
  { key: 'level', label: 'Explain at my level', hint: 'Matched to your programme and level' },
  { key: 'deeper', label: 'Go deeper', hint: 'Mechanisms and detail' },
  { key: 'teach', label: 'Teach me', hint: 'Step-by-step mini-lesson' },
  { key: 'quiz', label: 'Quiz me', hint: 'Questions to test yourself' },
];

function modeInstruction(mode: ExplainMode): string {
  const p = useData.getState().profile;
  const level = `${p?.programme ?? 'Pharmacy'} Level ${p?.level ?? '200'}`;
  switch (mode) {
    case 'simple':
      return 'Explain in the simplest possible terms, avoiding jargon. Short sentences.';
    case 'deeper':
      return `Go deeper than a ${level} textbook: mechanisms, pharmacokinetics, clinical nuance and evidence.`;
    case 'teach':
      return 'Teach this step by step as a short structured lesson, building from first principles with a worked clinical example.';
    case 'quiz':
      return 'Do not explain up front. Ask 5 focused questions one after another, then give the answers with brief explanations at the end.';
    case 'level':
    default:
      return `Pitch the explanation exactly at a ${level} student.`;
  }
}

/** Safety framing appended to every ward-round AI call. */
const SAFETY = [
  'You are a LEARNING AID for a student, never a clinical supervisor and never a decision-support tool.',
  'This data is de-identified learning notes, not a patient record. Never ask for or infer patient identity.',
  'Do not give patient-specific treatment decisions. Speak in general educational terms.',
  'Where it matters, remind the student to verify against approved guidelines, the formulary, their lecturer, pharmacist or clinical supervisor.',
].join(' ');

function roundContext(round: WardRound): string {
  const digest = digestRound(round);
  return [
    `WARD ROUND (de-identified learning notes only):`,
    JSON.stringify(digest, null, 2),
  ].join('\n');
}

// ---- Whole-round analysis ---------------------------------------------

const SECTION_KEYS = [
  'SUMMARY',
  'KEY LEARNING POINTS',
  'KNOWLEDGE GAPS',
  'QUESTIONS',
  'REVISION RECOMMENDATIONS',
  'CONNECTIONS',
  'LEARNING DIFFICULTY',
] as const;

/** Split the model's response into the seven requested sections. */
function parseSections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  // Build a regex that finds each heading regardless of markdown decoration.
  const positions: Array<{ key: string; index: number; length: number }> = [];
  for (const key of SECTION_KEYS) {
    const re = new RegExp(`^[#*\\s\\d.)-]*${key.replace(/ /g, '[ _-]+')}\\s*:?\\s*$`, 'im');
    const m = re.exec(text);
    if (m && m.index >= 0) positions.push({ key, index: m.index, length: m[0].length });
  }
  positions.sort((a, b) => a.index - b.index);
  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    const next = positions[i + 1];
    const body = text.slice(cur.index + cur.length, next ? next.index : text.length);
    const lines = body
      .split('\n')
      .map((l) => l.replace(/^[\s>*-]*[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
      .filter((l) => l && !/^[-=_]{3,}$/.test(l));
    out[cur.key] = lines;
  }
  return out;
}

function buildAnalysisPrompt(round: WardRound, mode: ExplainMode): string {
  return [
    `Analyze my ward round and help me learn from it.`,
    modeInstruction(mode),
    '',
    'Return EXACTLY these seven sections, each as a heading on its own line followed by bullet points:',
    'SUMMARY',
    'KEY LEARNING POINTS',
    'KNOWLEDGE GAPS',
    'QUESTIONS',
    'REVISION RECOMMENDATIONS',
    'CONNECTIONS',
    'LEARNING DIFFICULTY',
    '',
    'Guidance per section:',
    '- SUMMARY: a concise account of what I encountered.',
    '- KEY LEARNING POINTS: the important concepts, drawn from my notes.',
    '- KNOWLEDGE GAPS: where my notes suggest incomplete understanding.',
    '- QUESTIONS: useful follow-up questions I should be able to answer.',
    '- REVISION RECOMMENDATIONS: prioritised, realistic revision list.',
    '- CONNECTIONS: link Disease → Pharmacology → Medicine → Investigation → Therapeutics.',
    '- LEARNING DIFFICULTY: topics that likely need a deeper explanation.',
    '',
    'Base everything ONLY on my notes below. Do not invent encounters I did not record.',
    '',
    roundContext(round),
  ].join('\n');
}

/** Persist (or update) the analysis record for a round. */
async function saveAnalysis(a: WardAnalysis): Promise<WardAnalysis> {
  await useData.getState().save('wardAnalysis', a);
  return a;
}

export function analysisPending(roundId: string): boolean {
  const a = analysisFor(roundId);
  return !!a && (a.status === 'pending' || a.status === 'processing');
}

/**
 * Queue an analysis for later. Used when the student finishes a round while
 * offline or without AI configured — the round is never lost, and the job is
 * picked up by `processPendingWardAnalyses()` once back online.
 */
export async function queueAnalysis(roundId: string): Promise<WardAnalysis> {
  const existing = analysisFor(roundId);
  if (existing && existing.status !== 'failed') return existing;
  const a = existing ?? newWardAnalysis(roundId);
  return saveAnalysis({ ...a, status: 'pending', error: undefined, updatedAt: Date.now() });
}

export function canRunAi(): boolean {
  const online = typeof navigator === 'undefined' || navigator.onLine;
  return online && aiReady('analyzer');
}

/**
 * Run the AI analysis for a round. Returns the stored analysis record. On
 * failure the record is kept with status 'failed' so it can be retried; the
 * round and its entries are never touched.
 */
export async function analyzeRound(roundId: string, mode: ExplainMode = 'level'): Promise<WardAnalysis | null> {
  const round = getRound(roundId);
  if (!round) return null;

  const counts = countsFor(roundId);
  if (!counts.total) {
    useData.getState().setStatus('Nothing captured in this round yet.');
    return null;
  }

  const base = analysisFor(roundId) ?? newWardAnalysis(roundId);
  let record = await saveAnalysis({
    ...base,
    status: 'processing',
    attempts: (base.attempts ?? 0) + 1,
    error: undefined,
    updatedAt: Date.now(),
  });

  if (!canRunAi()) {
    return saveAnalysis({
      ...record,
      status: 'pending',
      error: navigator.onLine ? 'AI is not configured yet.' : 'Offline — queued.',
      updatedAt: Date.now(),
    });
  }

  const res = await runAiModule('analyzer', buildAnalysisPrompt(round, mode), SAFETY);

  if (!res.ok) {
    return saveAnalysis({ ...record, status: 'failed', error: res.error, updatedAt: Date.now() });
  }

  const sections = parseSections(res.text);
  const summarySection = sections['SUMMARY'] ?? [];
  record = {
    ...record,
    status: 'completed',
    model: useData.getState().settings?.ai?.analyzer?.model,
    summary: summarySection.join('\n') || res.text.slice(0, 1200),
    keyLearningPoints: sections['KEY LEARNING POINTS'] ?? [],
    knowledgeGaps: sections['KNOWLEDGE GAPS'] ?? [],
    questions: sections['QUESTIONS'] ?? [],
    revisionRecommendations: sections['REVISION RECOMMENDATIONS'] ?? [],
    connections: sections['CONNECTIONS'] ?? [],
    difficultTopics: sections['LEARNING DIFFICULTY'] ?? [],
    raw: res.text,
    error: undefined,
    updatedAt: Date.now(),
  };

  await saveAnalysis(record);
  // Mirror into the AI chat history so it's reviewable in the AI tab.
  await logAiTask('analyzer', `Analyze my ward round — ${round.ward}, ${round.date}`, res.text, `Ward round · ${round.ward}`);
  useData.getState().setStatus('✓ Ward round analyzed');
  return record;
}

/**
 * Process every queued/failed ward-round analysis. Called on startup and when
 * the browser comes back online (wired in App.tsx alongside the other queues).
 */
let wardQueueRunning = false;
export async function processPendingWardAnalyses(): Promise<{ processed: number; failed: number }> {
  if (wardQueueRunning) return { processed: 0, failed: 0 };
  if (!canRunAi()) return { processed: 0, failed: 0 };
  wardQueueRunning = true;
  try {
    const pending = useData
      .getState()
      .wardAnalyses.filter((a) => a.status === 'pending' || (a.status === 'failed' && (a.attempts ?? 0) < 5));
    let processed = 0;
    let failed = 0;
    for (const a of pending) {
      const result = await analyzeRound(a.roundId);
      if (result?.status === 'completed') processed++;
      else failed++;
    }
    if (processed) useData.getState().setStatus(`✓ AI analyzed ${processed} ward round(s)`);
    return { processed, failed };
  } finally {
    wardQueueRunning = false;
  }
}

// ---- Ask AI about a single entry --------------------------------------

function entryPrompt(entry: WardEntry, round: WardRound | null, mode: ExplainMode): string {
  const meta = WARD_ENTRY_META[entry.type];
  const subject = entry.title || entry.content;
  const ask: Record<WardEntry['type'], string> = {
    medicine: `Explain the mechanism, key indications, important adverse effects and counselling points for "${subject}".`,
    condition: `Explain "${subject}" using WHO → WHAT → WHERE → WHY → HOW → DT.`,
    investigation: `Explain why "${subject}" is requested, how to interpret it, and its clinical significance.`,
    question: `Help me answer this question: "${subject}".`,
    learning: `Explain this concept more deeply: "${subject}".`,
    note: `Help me understand and expand on this note: "${subject}".`,
    reasoning: `Review my clinical reasoning and show me what I understood well and what I may have missed: "${subject}".`,
    reflection: `Help me turn this reflection into concrete next study steps: "${subject}".`,
  };
  return [
    ask[entry.type],
    entry.content && entry.title ? `My note says: "${entry.content}"` : '',
    modeInstruction(mode),
    round ? `Context: captured during a ward round on ${round.ward} (${round.date}), focus: ${round.focus || 'general'}.` : '',
    `This was captured as a ${meta.label.toLowerCase()} in my ward round notes.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Ask the tutor about one captured entry. Result goes to the AI chat log. */
export async function askAboutEntry(
  entry: WardEntry,
  mode: ExplainMode = 'level',
  onToken?: (t: string) => void
): Promise<{ ok: boolean; text: string }> {
  const round = getRound(entry.roundId);
  const prompt = entryPrompt(entry, round, mode);
  const res = await runAiModule('tutor', prompt, SAFETY, { onToken });
  if (!res.ok) return { ok: false, text: res.error };
  await logAiTask('tutor', prompt, res.text, entry.title || 'Ward round entry');
  return { ok: true, text: res.text };
}

// ---- Natural-language capture -----------------------------------------

export interface WardSuggestion {
  type: WardEntry['type'];
  title: string;
  content: string;
  className?: string;
  adverseEffects?: string[];
  keyPoints?: string[];
}

/**
 * Interpret a free-form note into one or more structured suggestions.
 * The caller MUST show these as suggestions the student can accept, edit or
 * reject — the original text is always preserved verbatim by the caller.
 */
export async function interpretNote(text: string): Promise<{ ok: boolean; suggestions: WardSuggestion[]; error?: string }> {
  if (!canRunAi()) {
    return { ok: false, suggestions: [], error: navigator.onLine ? 'AI is not configured — add a key in Settings → AI.' : 'You are offline.' };
  }
  const prompt = [
    'Read my rough ward-round note and split it into structured learning captures.',
    'Return ONLY valid JSON, no commentary, in exactly this shape:',
    '{"items":[{"type":"medicine|condition|investigation|question|learning|note","title":"short subject","content":"the learning point in clear words","className":"drug class if a medicine","adverseEffects":["..."],"keyPoints":["..."]}]}',
    'Rules: keep it faithful to my note; never invent clinical facts I did not write; omit optional fields you are unsure about; never include patient-identifying information.',
    `NOTE: "${text.replace(/"/g, '\\"')}"`,
  ].join('\n');

  const res = await runAiModule('notes', prompt, SAFETY + ' Return strictly valid JSON only.');
  if (!res.ok) return { ok: false, suggestions: [], error: res.error };

  try {
    let clean = res.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, suggestions: [], error: 'AI returned an unexpected format.' };
    const parsed = JSON.parse(clean.slice(start, end + 1));
    const valid: WardEntry['type'][] = ['learning', 'medicine', 'condition', 'investigation', 'question', 'note'];
    const items: WardSuggestion[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((i: any) => i && typeof i === 'object')
      .map((i: any) => ({
        type: valid.includes(i.type) ? i.type : 'learning',
        title: String(i.title ?? '').slice(0, 120),
        content: String(i.content ?? '').slice(0, 2000),
        className: i.className ? String(i.className) : undefined,
        adverseEffects: Array.isArray(i.adverseEffects) ? i.adverseEffects.map(String) : undefined,
        keyPoints: Array.isArray(i.keyPoints) ? i.keyPoints.map(String) : undefined,
      }))
      .filter((i: WardSuggestion) => i.title || i.content);
    if (!items.length) return { ok: false, suggestions: [], error: 'AI could not find anything to structure.' };
    return { ok: true, suggestions: items };
  } catch {
    return { ok: false, suggestions: [], error: 'Could not read the AI response.' };
  }
}

/** Count of ward analyses still waiting for AI (shown in the UI). */
export function pendingWardAnalysisCount(): number {
  return useData.getState().wardAnalyses.filter((a) => a.status === 'pending' || a.status === 'failed').length;
}

/** Convenience for the summary screen: how many entries a round holds. */
export function roundHasContent(roundId: string): boolean {
  return entriesFor(roundId).length > 0;
}

// ---- Ward Round AI Chat (dedicated section) -----------------------------

/**
 * Build a rich, detailed context about ONE ward round (and optionally one
 * patient within it) to feed the Ward Round AI. This is deliberately much
 * fuller than the whole-round analysis prompt so the AI can carry on a deep
 * teaching conversation: full patient-by-patient grouping, linked records in
 * the knowledge base, the round's reflection/focus, and connected clinical
 * days/medicines/diseases from the rest of the app.
 */
export function buildRoundAiContext(roundId: string, patientLabel?: string | null): string {
  const st = useData.getState();
  const round = getRound(roundId);
  if (!round) return '';
  const allEntries = entriesFor(roundId);
  // Optional: filter to one patient
  const entries = patientLabel
    ? allEntries.filter((e) => (e.patientLabel || '').trim() === patientLabel.trim())
    : allEntries;

  // Group entries by patient for readability
  const byPatient: Record<string, WardEntry[]> = {};
  const unassigned: WardEntry[] = [];
  for (const e of entries) {
    const p = (e.patientLabel || '').trim();
    if (!p) { unassigned.push(e); continue; }
    (byPatient[p] ||= []).push(e);
  }

  const fmtEntry = (e: WardEntry) => {
    const meta = WARD_ENTRY_META[e.type];
    const title = e.title ? ` [${meta.label}: ${e.title}]` : '';
    const lines = [`  - ${meta.icon} ${meta.label}${title}`];
    if (e.content) lines.push(`      ${e.content}`);
    if (e.reasoning) {
      const r = e.reasoning;
      if (r.considered) lines.push(`      · Considered: ${r.considered}`);
      if (r.relevantInfo) lines.push(`      · Relevant info: ${r.relevantInfo}`);
      if (r.understood) lines.push(`      · Understood: ${r.understood}`);
      if (r.confused) lines.push(`      · Confused about: ${r.confused}`);
      if (r.investigateFurther) lines.push(`      · To investigate: ${r.investigateFurther}`);
    }
    if (e.aiSuggestion?.keyPoints?.length) {
      lines.push(`      · Key points (accepted AI): ${e.aiSuggestion.keyPoints.join('; ')}`);
    }
    return lines.join('\n');
  };

  const out: string[] = [];
  out.push('=== WARD ROUND FOCUS ===');
  out.push(`Ward: ${round.ward}`);
  out.push(`Date: ${round.date}`);
  if (round.focus) out.push(`Focus: ${round.focus}`);
  if (round.objective) out.push(`Objective: ${round.objective}`);
  if (round.rotation) out.push(`Rotation: ${round.rotation}`);
  out.push(`Status: ${round.status}${round.durationMinutes ? ` · ${round.durationMinutes} min` : ''}`);
  const counts = countsFor(roundId);
  out.push(`Captures: ${counts.total} total (${Object.entries(counts).filter(([k]) => k !== 'total').map(([k,v]) => `${k}:${v}`).join(', ')})`);

  if (patientLabel) {
    out.push('');
    out.push(`=== PATIENT FOCUS: ${patientLabel} ===`);
    out.push(`(Only discussing captures labelled "${patientLabel}". The student is de-identified, this is a learning case, not a patient record.)`);
    const list = byPatient[patientLabel] || [];
    if (!list.length) out.push('No captures yet for this patient.');
    else list.forEach((e) => out.push(fmtEntry(e)));
  } else {
    out.push('');
    out.push('=== CAPTURES BY PATIENT ===');
    const patients = Object.keys(byPatient);
    if (!patients.length && !unassigned.length) {
      out.push('(No captures yet.)');
    } else {
      for (const p of patients) {
        out.push(`\n🧑‍⚕️ ${p} (${byPatient[p].length} capture${byPatient[p].length === 1 ? '' : 's'})`);
        byPatient[p].forEach((e) => out.push(fmtEntry(e)));
      }
      if (unassigned.length) {
        out.push(`\n📝 Unassigned / general captures (${unassigned.length})`);
        unassigned.forEach((e) => out.push(fmtEntry(e)));
      }
    }
  }

  if (round.reflection) {
    out.push('');
    out.push('=== END-OF-ROUND REFLECTION ===');
    out.push(round.reflection);
  }

  const analysis = analysisFor(roundId);
  if (analysis && analysis.status === 'completed') {
    out.push('');
    out.push('=== PREVIOUS AI ANALYSIS (for continuity) ===');
    if (analysis.summary) out.push(`Summary: ${analysis.summary}`);
    if (analysis.keyLearningPoints?.length) out.push('Key learning: ' + analysis.keyLearningPoints.join('; '));
    if (analysis.knowledgeGaps?.length) out.push('Gaps: ' + analysis.knowledgeGaps.join('; '));
    if (analysis.questions?.length) out.push('Open questions: ' + analysis.questions.join('; '));
    if (analysis.revisionRecommendations?.length) out.push('Revision: ' + analysis.revisionRecommendations.join('; '));
  }

  return out.join('\n');
}

/**
 * Open the Ward Round AI section preloaded for a specific round (and optional
 * patient). Creates/reuses a chat session keyed by round+patient so continuing
 * the conversation later resumes where the student left off.
 *
 * Because chats are saved to the 'wardRound' section, every conversation is
 * automatically recorded and visible under the AI → Ward Round tab.
 */
export async function openRoundAi(roundId: string, patientLabel?: string | null, kickoffPrompt?: string): Promise<{ sessionId: string }> {
  const st = useData.getState();
  const round = getRound(roundId);
  if (!round) throw new Error('Round not found');
  const uid = (await import('../stores/data')).uid;
  const now = Date.now();

  // Session key: per-round, and per-patient if selected — so resuming the same
  // patient's case continues that conversation, not a fresh one.
  const sessionKey = patientLabel
    ? `wr:${roundId}:${patientLabel.trim()}`
    : `wr:${roundId}`;

  // Find existing session tagged with this key (stored in the first line of
  // title for easy lookup without schema change).
  let session = st.chats.find((c) => c.section === 'wardRound' && c.title?.startsWith(`[${sessionKey}]`));

  const patientSuffix = patientLabel ? ` · ${patientLabel}` : '';
  const baseTitle = `[${sessionKey}] 🏥 ${round.ward} · ${round.date}${patientSuffix}`;

  if (!session) {
    session = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      section: 'wardRound',
      title: baseTitle,
      messages: [],
      hidden: false,
    };
  }

  // Seed the system+context as the FIRST user message if new, so the AI
  // immediately has the full round loaded and the conversation starts live.
  const isBrandNew = (session.messages?.length ?? 0) === 0;
  if (isBrandNew) {
    const ctx = buildRoundAiContext(roundId, patientLabel);
    const seed = [
      `I'm opening Ward Round AI for the round at ${round.ward} on ${round.date}${patientLabel ? `, focused on the patient labelled "${patientLabel}"` : ''}.`,
      `Here is everything captured so far. Use it to teach me, quiz me, connect to pharmacology, and point out learning gaps. Always stay educational — no treatment decisions, remind me to verify with my supervisor/formulary when it matters.`,
      '',
      ctx,
    ].join('\n');
    // Seed message from user so the AI can respond with a welcome overview.
    session.messages = [
      ...(session.messages ?? []),
      { id: uid(), role: 'user' as const, text: seed, ts: now },
    ];
    await st.save('chat', session);

    // Run an opening AI response so the section opens already populated.
    const opener = kickoffPrompt ||
      (patientLabel
        ? `Give me a focused walkthrough of ${patientLabel}'s case: summarise the medicines, conditions, key labs/investigations, likely reasoning, the most important learning points, common mistakes students make, and 3 follow-up questions I should be able to answer.`
        : `Give me a concise overview of this ward round: top 5 learning points, the medications I should study more deeply, any clinical reasoning patterns worth noting, knowledge gaps I should close, and 3 quiz questions to test myself.`);
    try {
      const { aiChat: doChat } = await import('./ai');
      const { getEffectiveAiConfig } = await import('./aiTools');
      const cfg = getEffectiveAiConfig('wardRound');
      if (cfg && cfg.enabled && cfg.apiKey) {
        const systemPrompt = `CONTEXT FOR THIS CONVERSATION — the ward round data is in the first user message. Respond as a warm but rigorous clinical teacher. Speak to a pharmacy student at their recorded level. Use headings and bullet points for clarity. When referencing a medicine include class + 1-line mechanism + key counselling point. When referencing a condition include 1-line pathophys + typical first-line class (in general, not patient-specific advice). Point out drug-related problems, monitoring parameters, and counselling opportunities where relevant. End with a "Next to study" list of 3-5 concrete items. ${SAFETY}`;
        const seedText = (session.messages ?? []).map(m => (m.role === 'ai' ? 'Assistant: ' : 'Student: ') + m.text).join('\n\n');
        const combinedUser = `${seedText}\n\nStudent: ${opener}`;
        const res = await doChat(cfg, systemPrompt, combinedUser);
        if (res.ok) {
          await st.save('chat', {
            ...session,
            messages: [
              ...(session.messages ?? []),
              { id: uid(), role: 'ai' as const, text: res.text, ts: Date.now() },
            ],
            updatedAt: Date.now(),
          });
        }
      }
    } catch (e) {
      // AI not configured / key missing — session still exists, student types freely.
    }
  } else if (kickoffPrompt) {
    // Continuing an existing session with a new question — append + run.
    await st.save('chat', {
      ...session,
      messages: [...(session.messages ?? []), { id: uid(), role: 'user' as const, text: kickoffPrompt, ts: now }],
      updatedAt: now,
    });
  }

  return { sessionId: session.id };
}

/** Navigate to AI → Ward Round with a given session. Sets a transient
 *  "openSessionId" in sessionStorage so AiChat can pick the right thread on load. */
export function navigateToRoundAi(sessionId: string): void {
  try { sessionStorage.setItem('crx:wardAiSession', sessionId); } catch { /* ignore */ }
  window.location.hash = '#/ai';
}
