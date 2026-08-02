import { useData } from '../stores/data';
import { aiChat, type AiResult } from './ai';
import type { AiModuleConfig } from '../types';

export type AiModuleKey =
  | 'tutor'
  | 'analyzer'
  | 'notes'
  | 'questionGen'
  | 'revision'
  | 'chat'
  | 'bundler';

const MODULE_LABEL: Record<AiModuleKey, string> = {
  tutor: 'AI Clinical Tutor',
  analyzer: 'AI Learning Analyzer',
  notes: 'AI Note Organizer',
  questionGen: 'AI Question Generator',
  revision: 'AI Revision Coach',
  chat: 'AI Clinical Chat',
  bundler: 'AI Daily/Weekly Bundler',
};

export function aiModuleLabel(key: AiModuleKey): string {
  return MODULE_LABEL[key];
}

function studentContext(): string {
  const s = useData.getState();
  const p = s.profile;
  const prefs = s.settings?.learningProfile?.preferredExplanation ?? [];
  return [
    `Student: ${p?.programme ?? 'Pharmacy'} Level ${p?.level ?? '200'} at ${p?.site ?? 'clinical site'}.`,
    `Preferred explanation: ${prefs.length ? prefs.join(', ') : 'simple first, step-by-step'}.`,
    `My data: ${s.days.length} clinical days, ${s.diseases.length} conditions, ${s.medicines.length} medicines, ${s.investigations.length} investigations, ${s.questions.length} questions (${s.questions.filter((q) => q.status === 'open').length} open).`,
    'You are a learning aid, not a replacement for the student\'s clinical supervisor or pharmacist.',
  ].join('\n');
}

export function getAiConfig(key: AiModuleKey): AiModuleConfig | null {
  const cfg = useData.getState().settings?.ai?.[key];
  if (!cfg) return null;
  return cfg;
}

export function aiReady(key: AiModuleKey): boolean {
  const cfg = getAiConfig(key);
  return !!cfg && cfg.enabled && !!cfg.apiKey;
}

/** Run any configured AI module with the standard student context baked in. */
export async function runAiModule(
  key: AiModuleKey,
  userPrompt: string,
  extraContext = ''
): Promise<AiResult> {
  const cfg = getAiConfig(key);
  if (!cfg) return { ok: false, error: `Enable "${MODULE_LABEL[key]}" in Settings → AI to use this.` };
  if (!cfg.enabled) return { ok: false, error: `"${MODULE_LABEL[key]}" is disabled in Settings.` };
  if (!cfg.apiKey) return { ok: false, error: `No API key set for "${MODULE_LABEL[key]}". Add one in Settings → AI.` };
  const system = `You are CLINICAL Rx, a clinical learning assistant.\n${studentContext()}\n${extraContext}`.trim();
  return aiChat(cfg, system, userPrompt);
}

// ---- Semantic helpers used by the UI ----

/** Tutor: explain a disease/medicine/investigation from its record. */
export function explainEntity(kind: 'disease' | 'medicine' | 'investigation', rec: Record<string, any>): Promise<AiResult> {
  const label = (kind[0].toUpperCase() + kind.slice(1));
  const detail = [
    `Explain this ${label} to me at my level.`,
    'Use the WHO → WHAT → WHERE → WHY → HOW → DT structure where relevant.',
    `Record: ${JSON.stringify(rec)}`,
  ].join('\n');
  return runAiModule('tutor', detail);
}

/** Analyzer: summarize strengths/gaps from recent clinical data. */
export function analyzeLearning(): Promise<AiResult> {
  const s = useData.getState();
  const recentDays = s.days.slice(-7);
  const openQuestions = s.questions.filter((q) => q.status === 'open').slice(0, 15);
  const data = {
    recentDays: recentDays.map((d) => ({
      date: d.date,
      conditions: d.conditions,
      medicines: d.medicines,
      investigations: d.investigations,
      lessons: d.lessons,
      uncertainties: d.uncertainties,
      topicsToResearch: d.topicsToResearch,
    })),
    openQuestions: openQuestions.map((q) => q.text),
    topDiseases: s.diseases.slice(0, 10).map((d) => ({ name: d.name, encounters: d.encounters })),
    topMedicines: s.medicines.slice(0, 10).map((m) => ({ name: m.name, encounters: m.encounters })),
  };
  return runAiModule(
    'analyzer',
    'Analyze my recent clinical learning. Return: STRENGTHS (list), KNOWLEDGE GAPS (list), NEXT-STEP FOCUS (list).',
    'DATA:\n' + JSON.stringify(data)
  );
}

/** Notes: turn rough natural language into structured clinical learning records. */
export function organizeNote(text: string): Promise<AiResult> {
  return runAiModule(
    'notes',
    `Turn this clinical note into structured learning records. Return ONLY valid JSON with no commentary, shaped exactly like:
{"medicines":["..."],"diseases":["..."],"investigations":["..."],"lessons":["..."],"questions":["..."]}
Use empty arrays for anything not mentioned. Do not invent patient-identifying information.
NOTE: "${text}"`,
    'You extract structured de-identified clinical learning data from natural language.'
  );
}

/** Question generator: turn encounters into MCQs / study questions. */
export function generateQuestions(focus?: string, count = 5): Promise<AiResult> {
  const s = useData.getState();
  const context = focus
    ? focus
    : [
        ...s.days.flatMap((d) => d.conditions),
        ...s.days.flatMap((d) => d.medicines),
        ...s.diseases.map((d) => d.name),
        ...s.medicines.map((m) => m.name),
      ]
        .filter(Boolean)
        .slice(0, 12)
        .join(', ');
  return runAiModule(
    'questionGen',
    `Generate ${count} study questions from my recent clinical exposure. For each give the question, 4 options, and the correct answer with a 1-line explanation. Focus areas: ${context}.`,
    'Questions should test clinical knowledge appropriate for a pharmacy student at my level.'
  );
}

/** Revision coach: recommend what to revise next. */
export function revisionCoach(): Promise<AiResult> {
  const s = useData.getState();
  const incomplete = s.diseases
    .filter((d) => {
      const r = d.revision as any;
      return r && Object.values(r).some((v) => v === false);
    })
    .map((d) => d.name);
  const gaps = s.questions.filter((q) => q.status === 'open').slice(0, 10).map((q) => q.text);
  return runAiModule(
    'revision',
    `Recommend a revision plan. I've seen these conditions recently, some with incomplete revision coverage: ${incomplete.join(', ') || 'none yet'}. My open questions: ${gaps.join('; ') || 'none'}. Give a prioritized, realistic revision list with reasons.`
  );
}
