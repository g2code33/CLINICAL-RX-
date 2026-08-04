import type { ClinicalDay } from '../types';

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** True if a day has any real recorded content. */
export function dayHasData(d: ClinicalDay): boolean {
  return (
    (d.conditions?.length ?? 0) > 0 ||
    (d.medicines?.length ?? 0) > 0 ||
    (d.investigations?.length ?? 0) > 0 ||
    (d.lessons?.length ?? 0) > 0 ||
    (d.observations?.length ?? 0) > 0 ||
    (d.uncertainties?.length ?? 0) > 0
  );
}

export interface StreakInfo {
  current: number;
  best: number;
  loggedToday: boolean;
  loggedYesterday: boolean;
}

/** Current consecutive-day streak ending today (or yesterday if today isn't
 *  logged yet) plus the all-time best. */
export function computeStreak(days: ClinicalDay[], now = new Date()): StreakInfo {
  const withData = days.filter(dayHasData).map((d) => d.date);
  const set = new Set(withData);
  const today = toIso(now);
  const yesterday = addDays(today, -1);

  const loggedToday = set.has(today);
  const loggedYesterday = set.has(yesterday);

  let current = 0;
  let cursor = loggedToday ? today : loggedYesterday ? yesterday : null;
  if (cursor) {
    while (set.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
  }

  // Best streak: scan all unique dates.
  const dates = Array.from(set).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  return { current, best, loggedToday, loggedYesterday };
}

/** Check whether today is logged; if not and it's late, prompt a reminder. */
export function shouldRemind(days: ClinicalDay[], now = new Date()): boolean {
  if (computeStreak(days, now).loggedToday) return false;
  return now.getHours() >= 17; // after 5pm
}
