import { useData } from '../stores/data';
import { generateQuiz } from './aiTools';
import { newSavedQuiz } from './defaults';
import type { SavedQuiz } from '../types';

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** Monday of the week containing iso. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  return toIso(d);
}

function weekHasData(days: ReturnType<typeof useData.getState>['days'], monday: string): boolean {
  const sunday = addDays(monday, 6);
  return days.some((d) => {
    if (d.date < monday || d.date > sunday) return false;
    return (d.conditions?.length || d.medicines?.length || d.investigations?.length || d.lessons?.length || 0) > 0;
  });
}

function existingWeekly(monday: string): SavedQuiz | null {
  const quizzes = useData.getState().quizzes ?? [];
  return quizzes.find((q) => q.weekly && q.weekStart === monday) || null;
}

const inFlight: Record<string, boolean> = {};

/**
 * Auto-generate a weekly quiz for the given Monday (covering that whole week
 * — conditions, medicines, investigations, lessons and linked topics). Saves
 * it as a weekly quiz so it appears under "📅 Weekly quizzes" in the Quiz tab.
 * One per week, automatic.
 */
export async function generateWeeklyQuiz(monday: string, count = 10): Promise<SavedQuiz | null> {
  if (inFlight[monday]) return existingWeekly(monday);
  inFlight[monday] = true;
  try {
    const existing = existingWeekly(monday);
    if (existing) return existing;

    const st = useData.getState();
    const sunday = addDays(monday, 6);
    const weekDays = st.days.filter((d) => d.date >= monday && d.date <= sunday);

    // Build the focus from the week's data + linkages.
    const conditions = Array.from(new Set(weekDays.flatMap((d) => d.conditions))).filter(Boolean);
    const medicines = Array.from(new Set(weekDays.flatMap((d) => d.medicines))).filter(Boolean);
    const investigations = Array.from(new Set(weekDays.flatMap((d) => d.investigations))).filter(Boolean);
    const lessons = Array.from(new Set(weekDays.flatMap((d) => d.lessons))).filter(Boolean);
    // Linked topics: diseases/medicines related to the week's names.
    const linkedDiseases = st.diseases.filter((d) => conditions.some((c) => d.name.toLowerCase() === String(c).toLowerCase())).map((d) => d.name);
    const linkedMeds = st.medicines.filter((m) => medicines.some((mm) => m.name.toLowerCase() === String(mm).toLowerCase())).map((m) => m.name);

    const focus = [...conditions, ...medicines, ...investigations, ...linkedDiseases, ...linkedMeds]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 20)
      .join(', ');

    if (!focus) {
      useData.getState().setStatus('ℹ️ No clinical data in that week — no weekly quiz generated.');
      return null;
    }

    const q = await generateQuiz(focus, count, {
      maxTokens: 8000,
      timeoutMs: 300000,
    });
    if (!q) {
      useData.getState().setStatus('⚠️ Could not generate the weekly quiz (AI error).');
      return null;
    }

    const rec = newSavedQuiz({
      title: `Weekly Quiz — Week of ${monday}`,
      questions: q.questions,
      answers: new Array(q.questions.length).fill(-1),
      score: 0,
      durationSeconds: q.questions.length * 60,
    });
    const weekly: SavedQuiz = { ...rec, weekly: true, weekStart: monday };
    await st.save('quiz', weekly);
    st.setStatus(`✓ Weekly quiz ready — ${q.questions.length} questions (week of ${monday})`);
    return weekly;
  } finally {
    delete inFlight[monday];
  }
}

/** Auto-generate weekly quizzes for every completed week that doesn't have
 *  one yet. Called on app start + when data changes. */
export async function runAutoWeeklyQuizzes(): Promise<{ created: number }> {
  const st = useData.getState();
  const today = toIso(new Date());
  const mondays = Array.from(new Set(st.days.filter((d) => d.date < today).map((d) => mondayOf(d.date))));
  let created = 0;
  for (const m of mondays) {
    if (existingWeekly(m)) continue;
    if (!weekHasData(st.days, m)) continue;
    const rec = await generateWeeklyQuiz(m, 10);
    if (rec) created++;
  }
  return { created };
}
