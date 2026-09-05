import type { CPDrugCard, CPEncounter, CPScenario } from '../types';
import { useData } from '../stores/data';

/**
 * 💊 Community Pharmacy — persistent library (starters + study lists).
 *
 * Stored in localStorage so the student can customize / extend the built-in
 * starter scenarios and curate a personal "master these drugs/conditions"
 * study list without polluting the main record types.
 */

const STARTERS_KEY = 'clinical-rx:cp:starterScenarios:v1';
const STUDY_KEY = 'clinical-rx:cp:studyList:v1';

export interface CPStudyItem {
  id: string;
  kind: 'drug-class' | 'drug' | 'condition' | 'symptom' | 'counselling' | 'framework' | 'other';
  topic: string;
  notes?: string;
  priority: 1 | 2 | 3; // 1 = high, 2 = medium, 3 = someday
  mastered?: boolean;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_STARTERS = [
  'A mother walks in with her 4-year-old who has had a fever (38.5°C) and runny nose for 2 days; she wants "something strong" and mentions the child is also vomiting.',
  'A 55-year-old man on Atenolol and Hydrochlorothiazide asks for "the strongest painkiller" for a sharp knee pain after playing football over the weekend.',
  'A 22-year-old female student asks for Flagyl for "toilet infection"; she is also taking a combined oral contraceptive pill.',
  'A regular customer with known asthma asks for "the usual Ventolin" but mentions he has been using it 6 times a day this week and is waking up at night short of breath.',
  'An elderly man (~72) asks for "sleeping pills" — he seems a little confused and his daughter says he has been forgetting names of family members recently.',
  'A 28-week pregnant woman asks for something for heartburn — she has been taking plenty of baking soda and it\'s not helping.',
  'A teenager asks for Postinor-2; she says she had unprotected sex last night. She has never used emergency contraception before.',
  'A man buying amoxicillin for a tooth abscess says he gets a "rash" with penicillin but "it\'s not serious".',
  'A breastfeeding mother with a 3-month-old asks for something for a dry cough — she has been taking Benylin from a friend.',
  'A 60-year-old man on metformin, glibenclamide and lisinopril asks for a cough syrup; his cough is dry, irritating, and started 3 weeks ago.',
  'A 30F buys loperamide and oral rehydration salts but also mentions she has seen "some blood" in her stool this morning.',
  'A father brings his 2-year-old who has had diarrhoea for 1 day; he wants something to "stop it immediately".',
  'A woman asks for "herbal mix for infection" and says the chemist down the street gave her something that did not work; she has lower abdominal pain and a fever.',
  'A truck driver asks for a "cold medicine that won\'t make me sleep" for a flu that just started.',
  'A young adult asks for diazepam because he "can\'t sleep"; he says he ran out of the prescription from his doctor and has an exam tomorrow.',
];

export function loadStarters(): string[] {
  try {
    const raw = localStorage.getItem(STARTERS_KEY);
    if (!raw) return [...DEFAULT_STARTERS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_STARTERS];
    const cleaned = parsed.map((s) => String(s)).filter((s) => s.trim().length > 0);
    return cleaned.length ? cleaned : [...DEFAULT_STARTERS];
  } catch {
    return [...DEFAULT_STARTERS];
  }
}

export function saveStarters(list: string[]) {
  try {
    localStorage.setItem(STARTERS_KEY, JSON.stringify(list.map((s) => s.trim()).filter(Boolean)));
  } catch { /* storage full */ }
}

export function resetStarters() {
  try { localStorage.removeItem(STARTERS_KEY); } catch { /* ignore */ }
}

export function defaultStarters(): string[] {
  return [...DEFAULT_STARTERS];
}

export function loadStudyList(): CPStudyItem[] {
  try {
    const raw = localStorage.getItem(STUDY_KEY);
    if (!raw) return defaultStudyList();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultStudyList();
    return parsed;
  } catch {
    return defaultStudyList();
  }
}

export function saveStudyList(list: CPStudyItem[]) {
  try { localStorage.setItem(STUDY_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function s(kind: CPStudyItem['kind'], topic: string, priority: CPStudyItem['priority'] = 2, notes?: string): CPStudyItem {
  const now = Date.now();
  return { id: 'cp-study-' + now.toString(36) + Math.random().toString(36).slice(2, 6), kind, topic, notes, priority, createdAt: now, updatedAt: now };
}

/** Starter study list — high-yield community-pharmacy topics every student should master. */
export function defaultStudyList(): CPStudyItem[] {
  return [
    s('framework', 'WWHAM questioning framework', 1),
    s('framework', 'ASMETHOD questioning framework', 1),
    s('framework', 'ENCORE counselling framework', 1),
    s('drug-class', 'NSAIDs (ibuprofen, diclofenac, aspirin) — GI risk, CIs in asthma/renal/pregnancy', 1),
    s('drug-class', 'Paracetamol — dosing, overdose, liver risk', 1),
    s('drug-class', 'Antihistamines (sedating vs non-sedating) — in drivers, children, elderly', 2),
    s('drug-class', 'Topical steroids — potency ladder, finger-tip units, when not to use', 2),
    s('drug-class', 'Antacids / PPIs / H2 blockers — stepwise for dyspepsia', 2),
    s('drug-class', 'Antidiarrhoeals — loperamide cautions, ORS priority', 1),
    s('drug-class', 'Emergency contraception (levonorgestrel vs ulipristal) — timing, drug interactions', 1),
    s('drug-class', 'Antimalarials — when to sell OTC vs refer', 2),
    s('drug-class', 'Antibiotics — when to sell vs refer, common allergies, counselling', 1),
    s('drug-class', 'Cough / cold preparations — children under 6, driving, HTN warnings', 2),
    s('condition', 'Headache — red flags (SNOOP), OTC pathway, when to refer', 1),
    s('condition', 'Acute diarrhoea — children, red flags, ORS teaching', 1),
    s('condition', 'Urinary tract infection (UTI) — when to treat OTC, when to refer', 2),
    s('condition', 'Vaginal candidiasis vs STI — differential for "toilet infection"', 1),
    s('condition', 'Fever in under-5s — when to refer, tepid sponging, dosing by weight', 1),
    s('condition', 'Conjunctivitis — allergic vs bacterial, chloramphenicol eye drops', 2),
    s('condition', 'Low back pain — red flags, stepwise analgesia', 2),
    s('condition', 'Heartburn in pregnancy — stepwise, what to avoid', 2),
    s('condition', 'Allergic rhinitis — stepwise treatment', 3),
    s('condition', 'Sore throat — Centor-like reasoning, when antibiotics not needed', 2),
    s('symptom', 'Chest pain in the pharmacy — immediate A&E referral', 1),
    s('symptom', 'Paediatric rash — red flags (meningitis septicaemia)', 1),
    s('counselling', 'Metered-dose inhaler technique', 1),
    s('counselling', 'Eye drop / ointment administration', 2),
    s('counselling', 'How to counsel on antibiotics — complete course, probiotics, alcohol (Flagyl)', 1),
    s('counselling', "ART adherence basics — don't miss doses", 2),
  ];
}

/**
 * Turn the current CP library into a compact text block for the AI to
 * reference in preceptor discussions. Capped to stay inside context budgets.
 */
export function cpStudyContext(): string {
  const items = loadStudyList();
  if (!items.length) return '(no study list yet)';
  const byKind = new Map<string, CPStudyItem[]>();
  for (const it of items) {
    const list = byKind.get(it.kind) ?? [];
    list.push(it);
    byKind.set(it.kind, list);
  }
  const label: Record<CPStudyItem['kind'], string> = {
    'drug-class': 'DRUG CLASSES',
    drug: 'DRUGS',
    condition: 'CONDITIONS',
    symptom: 'SYMPTOMS / RED FLAGS',
    counselling: 'COUNSELLING SKILLS',
    framework: 'CONSULTATION FRAMEWORKS',
    other: 'OTHER',
  };
  const lines = ['STUDENT\'S COMMUNITY-PHARMACY STUDY LIST:'];
  for (const [kind, list] of byKind) {
    const high = list.filter((i) => i.priority === 1 && !i.mastered);
    const med = list.filter((i) => i.priority === 2 && !i.mastered);
    const low = list.filter((i) => i.priority === 3 && !i.mastered);
    const done = list.filter((i) => i.mastered);
    const section = (header: string, arr: CPStudyItem[]) => {
      if (!arr.length) return;
      lines.push(`\n[${label[kind as CPStudyItem['kind']]} — ${header}]`);
      for (const it of arr) lines.push(`- ${it.topic}${it.notes ? ` — ${it.notes}` : ''}`);
    };
    section('High priority', high);
    section('Medium', med);
    section('Someday', low);
    if (done.length) lines.push(`  (mastered: ${done.map((d) => d.topic).join(', ')})`);
  }
  return lines.join('\n');
}

/** Build a prompt that asks the AI to generate more starter scenarios. */
export function generateStartersPrompt(existing: string[], count = 10): string {
  return [
    'You are a community-pharmacy preceptor writing realistic counter scenarios for a pharmacy student to practise with.',
    'Scenarios should feel like real patients walking into a community pharmacy in Ghana/West Africa.',
    'Mix paediatric, adult, elderly, pregnancy, minor ailment, prescription-queries, red-flag, and "tricky sale / refuse sale" cases.',
    'Include drug-interaction pitfalls, polypharmacy in the elderly, OTC requests that mask serious disease, and cultural/social realism (NHIS, herbal prep use, tro-tro drivers, market traders, students).',
    `The student already has these ${existing.length} scenarios — DO NOT repeat them:`,
    ...existing.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Return ${count} NEW scenarios as a plain numbered list, each 1-2 sentences long. No extra commentary, just the numbered scenarios. Start each with "A " or "An " so they read naturally.`,
  ].join('\n');
}

/** Parse numbered scenarios out of an AI response. */
export function parseStartersFromAi(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const m = /^\s*(?:\d+[\.\)]\s*[-*•]?\s*|[-*•]\s+)(.+)$/.exec(line);
    const candidate = m ? m[1].trim() : line.trim();
    if (candidate.length >= 20 && candidate.length <= 400) out.push(candidate);
  }
  return Array.from(new Set(out));
}

/** Community-pharmacy bundler context — encounters + drug cards + scenarios over a window. */
export interface CPBundleContext {
  encounters: CPEncounter[];
  drugCards: CPDrugCard[];
  scenarios: CPScenario[];
  start: string;
  end: string;
}

export function collectCPBundleContext(start: string, end: string): CPBundleContext {
  const s = useData.getState();
  const inRange = (date?: string) => !!date && date >= start && date <= end;
  return {
    encounters: s.cpEncounters.filter((e) => inRange(e.date)),
    drugCards: s.cpDrugCards.filter((d) => d.updatedAt >= new Date(start + 'T00:00:00').getTime() && d.updatedAt <= new Date(end + 'T23:59:59.999').getTime()),
    scenarios: s.cpScenarios.filter((sc) => sc.updatedAt >= new Date(start + 'T00:00:00').getTime() && sc.updatedAt <= new Date(end + 'T23:59:59.999').getTime()),
    start, end,
  };
}

export function formatCPBundleContext(ctx: CPBundleContext): string {
  const lines: string[] = [];
  lines.push(`COMMUNITY-PHARMACY BUNDLE: ${ctx.start} → ${ctx.end}`);
  lines.push(`Encounters: ${ctx.encounters.length}  Drug cards: ${ctx.drugCards.length}  Scenarios worked: ${ctx.scenarios.length}`);
  lines.push('');

  if (ctx.encounters.length) {
    lines.push('=== PATIENT ENCOUNTERS ===');
    for (const e of ctx.encounters) {
      lines.push(`\n## ${e.date} · ${e.title} [${e.encounterType}] conf=${e.confidence}/5`);
      lines.push(`Patient: ${e.patientPresentation || '-'}`);
      if (e.patientContext.ageGroup || e.patientContext.pregnantOrBreastfeeding)
        lines.push(`Patient factors: age=${e.patientContext.ageGroup || '-'} pregnant/BF=${e.patientContext.pregnantOrBreastfeeding ? 'yes' : 'no'}`);
      if (e.patientContext.comorbidities?.length) lines.push(`Comorbidities: ${e.patientContext.comorbidities.join(', ')}`);
      if (e.patientContext.currentMeds?.length) lines.push(`Current meds: ${e.patientContext.currentMeds.join(', ')}`);
      if (e.patientContext.allergies?.length) lines.push(`Allergies: ${e.patientContext.allergies.join(', ')}`);
      if (e.symptoms?.length) lines.push(`Symptoms: ${e.symptoms.join(', ')}`);
      if (e.duration) lines.push(`Duration: ${e.duration}`);
      if (e.redFlags?.length) lines.push(`RED FLAGS: ${e.redFlags.join(', ')}`);
      lines.push(`Action: ${e.actionTaken} · Product: ${e.recommendedProduct || '-'} · Dose: ${e.dosageGiven || '-'}`);
      if (e.counsellingProvided?.length) lines.push(`Counselling: ${e.counsellingProvided.join('; ')}`);
      if (e.warningsGiven?.length) lines.push(`Warnings: ${e.warningsGiven.join('; ')}`);
      if (e.followUp && e.followUp !== 'none') lines.push(`Follow-up: ${e.followUp} · Referral: ${e.referralReason || '-'}`);
      if (e.reflection) lines.push(`Reflection: ${e.reflection}`);
      if (e.knowledgeGaps?.length) lines.push(`Knowledge gaps: ${e.knowledgeGaps.join(', ')}`);
    }
  }

  if (ctx.drugCards.length) {
    lines.push('\n=== DRUG CARDS STUDIED THIS PERIOD ===');
    for (const d of ctx.drugCards) {
      lines.push(`\n- ${d.genericName} (${d.schedule || '?'}, ${d.drugClass || '?'}) conf=${d.confidence}/5`);
      if (d.indicationsCommunity?.length) lines.push(`  Indications: ${d.indicationsCommunity.join(', ')}`);
      if (d.counsellingPoints?.length) lines.push(`  Counselling: ${d.counsellingPoints.slice(0, 4).join('; ')}`);
      if (d.interactionsToFlag?.length) lines.push(`  Interactions: ${d.interactionsToFlag.join(', ')}`);
      if (d.redFlagsRefer?.length) lines.push(`  Refer when: ${d.redFlagsRefer.join(', ')}`);
    }
  }

  if (ctx.scenarios.length) {
    lines.push('\n=== PRACTICE SCENARIOS WORKED ===');
    for (const sc of ctx.scenarios) {
      lines.push(`\n- [${sc.difficulty}] ${sc.scenario}`);
      if (sc.studentAnswer) lines.push(`  My answer: ${sc.studentAnswer.slice(0, 200)}`);
      if (sc.idealApproach) lines.push(`  Ideal: ${sc.idealApproach.slice(0, 200)}`);
    }
  }

  lines.push('\n' + cpStudyContext());
  return lines.join('\n');
}

export function cpBundleStats(ctx: CPBundleContext): Record<string, number> {
  return {
    Encounters: ctx.encounters.length,
    'OTC recs': ctx.encounters.filter((e) => e.actionTaken === 'recommend-otc').length,
    Referrals: ctx.encounters.filter((e) => ['refer-to-doctor', 'refer-emergency', 'contact-prescriber'].includes(e.actionTaken)).length,
    'Refusals': ctx.encounters.filter((e) => e.actionTaken === 'refuse-sale').length,
    'Drugs studied': ctx.drugCards.length,
    'Scenarios worked': ctx.scenarios.filter((s) => s.completed).length,
    'Low-confidence encounters': ctx.encounters.filter((e) => (e.confidence ?? 3) <= 2).length,
  };
}
