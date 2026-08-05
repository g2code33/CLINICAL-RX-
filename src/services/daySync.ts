import { useData } from '../stores/data';
import { newDisease, newMedicine, newInvestigation, newLesson } from './defaults';

/**
 * Ensure the clinical compartments reflect what's on a clinical day.
 * When a day has conditions / medicines / investigations / lessons, make sure
 * the corresponding entities exist (by name) in Diseases / Medicines /
 * Investigations / Lessons — so the day info shows up in every compartment.
 * Skips records that already exist (matched by name).
 */
export async function syncDayToCompartments(dayId: string): Promise<{ created: number }> {
  const st = useData.getState();
  const day = st.days.find((d) => d.id === dayId);
  if (!day) return { created: 0 };

  let created = 0;

  // Conditions -> Diseases
  for (const name of day.conditions ?? []) {
    const n = String(name).trim();
    if (!n) continue;
    if (st.diseases.some((d) => d.name.toLowerCase() === n.toLowerCase())) continue;
    await st.save('disease', newDisease(n));
    created++;
  }

  // Medicines -> Medicines
  for (const name of day.medicines ?? []) {
    const n = String(name).trim();
    if (!n) continue;
    if (st.medicines.some((m) => m.name.toLowerCase() === n.toLowerCase())) continue;
    await st.save('medicine', newMedicine(n));
    created++;
  }

  // Investigations -> Investigations
  for (const name of day.investigations ?? []) {
    const n = String(name).trim();
    if (!n) continue;
    if (st.investigations.some((i) => i.name.toLowerCase() === n.toLowerCase())) continue;
    await st.save('investigation', newInvestigation(n));
    created++;
  }

  // Lessons -> Lessons
  for (const text of day.lessons ?? []) {
    const t = String(text).trim();
    if (!t) continue;
    if (st.lessons.some((l) => l.title.toLowerCase() === t.toLowerCase())) continue;
    await st.save('lesson', newLesson(t, day.date));
    created++;
  }

  if (created > 0) {
    st.setStatus(`✓ Synced ${created} item(s) from the day into your compartments`);
  }
  return { created };
}
