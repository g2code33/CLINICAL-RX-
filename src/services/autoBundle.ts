import { useData } from '../stores/data';
import { generateBundle, processAiQueue, aiAvailable } from './bundler';

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday-start week key (YYYY-Www) for a given date string. */
function weekKey(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Monday=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const wk = Math.ceil(((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(monday.getFullYear(), 0, 1).getDay() + 1) / 7);
  return `${monday.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function mondayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toIso(d);
}

function hasAutoBundle(type: 'auto-daily' | 'auto-weekly', key: string): boolean {
  const bundles = useData.getState().bundles.filter((b) => b.type === type);
  if (type === 'auto-daily') return bundles.some((b) => b.periodStart === key && b.periodEnd === key);
  return bundles.some((b) => weekKey(b.periodStart) === key || mondayOfWeek(b.periodStart) === key);
}

// In-memory guard so a burst of saves (or save + timer racing) can never
// create two auto bundles for the same day. Keyed by `type:periodStart`.
const inFlight: Record<string, boolean> = {};

function isInFlight(type: 'auto-daily' | 'auto-weekly', key: string): boolean {
  return !!inFlight[`${type}:${key}`];
}
function markInFlight(type: 'auto-daily' | 'auto-weekly', key: string) {
  inFlight[`${type}:${key}`] = true;
}
function clearInFlight(type: 'auto-daily' | 'auto-weekly', key: string) {
  delete inFlight[`${type}:${key}`];
}

/**
 * Create today's auto-daily bundle ONLY if none exists and none is being
 * created right now — guaranteed single bundle per day even with concurrent
 * saves (QuickAdd + ClinicalDays + AiChat + startup + 5-min timer).
 */
async function createAutoDaily(date: string): Promise<boolean> {
  if (hasAutoBundle('auto-daily', date) || isInFlight('auto-daily', date)) return false;
  markInFlight('auto-daily', date);
  try {
    await generateBundle({
      type: 'auto-daily',
      title: `AUTO — Daily Bundle — ${date}`,
      periodStart: date,
      periodEnd: date,
      sourceModules: ['day', 'disease', 'medicine', 'investigation', 'question', 'wardRound'],
    });
    return true;
  } finally {
    clearInFlight('auto-daily', date);
  }
}

/**
 * Generate automatic bundles for any completed clinical days / weeks that don't
 * already have one. Runs on app start. Bundles are created immediately with a
 * local summary; AI enrichment is queued and processed when AI is available.
 */
export async function runAutoBundling(): Promise<{ daily: number; weekly: number }> {
  const s = useData.getState();
  const settings = s.settings;
  const today = toIso(new Date());
  let daily = 0;
  let weekly = 0;

  const days = s.days.filter((d) => d.date < today); // only completed days
  // Ward rounds are bundle-worthy on their own: a day with only a ward round
  // (no clinical-day record) must still get its automatic bundle.
  const wardDates = Array.from(
    new Set(s.wardRounds.filter((r) => r.date < today && !r.archived).map((r) => r.date))
  );
  const allDates = Array.from(new Set([...days.map((d) => d.date), ...wardDates])).sort();

  if (settings?.autoDailyBundle) {
    for (const date of allDates) {
      if (await createAutoDaily(date)) daily++;
    }
  }

  if (settings?.autoWeeklyBundle && allDates.length) {
    const weeks = Array.from(new Set(allDates.map((d) => weekKey(d))));
    for (const wk of weeks) {
      if (hasAutoBundle('auto-weekly', wk)) continue;
      const monday = mondayOfWeek(wk);
      const end = new Date(monday + 'T00:00:00');
      end.setDate(end.getDate() + 6);
      const sunday = toIso(end);
      await generateBundle({
        type: 'auto-weekly',
        title: `AUTO — Weekly Bundle — ${monday} → ${sunday}`,
        periodStart: monday,
        periodEnd: sunday,
        sourceModules: ['day', 'disease', 'medicine', 'investigation', 'question', 'wardRound'],
      });
      weekly++;
    }
  }

  return { daily, weekly };
}

/**
 * Process the pending-AI queue when AI is configured. Also auto-triggers a
 * bundle for TODAY's clinical day if one hasn't been made yet (daily
 * automation the moment you record something).
 */
export async function processAiWhenOnline(): Promise<{ processed: number; failed: number }> {
  // Auto-create today's bundle if the day has data and a bundle is missing.
  const s = useData.getState();
  const today = toIso(new Date());
  const settings = s.settings;
  const todayDay = s.days.find((d) => d.date === today);
  const dayHasData = !!todayDay && !!(todayDay.conditions.length || todayDay.medicines.length || todayDay.investigations.length || todayDay.lessons.length);
  // A completed ward round today is enough on its own to warrant a bundle.
  const todayRoundIds = s.wardRounds.filter((r) => r.date === today && !r.archived).map((r) => r.id);
  const wardHasData = todayRoundIds.some((id) => s.wardEntries.some((e) => e.roundId === id));
  const hasData = dayHasData || wardHasData;
  if (settings?.autoDailyBundle && hasData) {
    await createAutoDaily(today); // no-op if already exists or in-flight
  }

  if (!navigator.onLine) return { processed: 0, failed: 0 };
  if (!aiAvailable()) return { processed: 0, failed: 0 };
  const pending = useData.getState().settings?.aiPendingBundles?.length ?? 0;
  if (!pending) return { processed: 0, failed: 0 };
  return processAiQueue();
}

/** Periodic re-check so queued AI enrichment retries on its own. */
export function setupAutoAndReconnect() {
  const run = () => {
    runAutoBundling().then((r) => {
      if (r.daily || r.weekly) {
        useData.getState().setStatus(`✓ Generated ${r.daily + r.weekly} automatic bundle(s)`);
      }
      processAiWhenOnline().then((p) => {
        if (p.processed) useData.getState().setStatus(`✓ AI processed ${p.processed} pending bundle(s)`);
      });
    });
  };

  run();

  window.addEventListener('online', run);

  // Retry timer: every 5 minutes, attempt pending-AI enrichment again (and
  // today's bundle), so automation runs even without reloading the app.
  const timer = setInterval(() => {
    processAiWhenOnline().then((p) => {
      if (p.processed) useData.getState().setStatus(`✓ AI processed ${p.processed} pending bundle(s)`);
    });
  }, 5 * 60 * 1000);

  return () => {
    window.removeEventListener('online', run);
    clearInterval(timer);
  };
}
