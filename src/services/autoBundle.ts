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

/**
 * Generate automatic bundles for any completed clinical days / weeks that don't
 * already have one. Runs on app start. Bundles are created immediately with a
 * local summary; AI enrichment is queued and processed when the user is online.
 */
export async function runAutoBundling(): Promise<{ daily: number; weekly: number }> {
  const s = useData.getState();
  const settings = s.settings;
  const today = toIso(new Date());
  let daily = 0;
  let weekly = 0;

  const days = s.days.filter((d) => d.date < today); // only completed days

  if (settings?.autoDailyBundle) {
    for (const day of days) {
      if (hasAutoBundle('auto-daily', day.date)) continue;
      await generateBundle({
        type: 'auto-daily',
        title: `AUTO — Daily Bundle — ${day.date}`,
        periodStart: day.date,
        periodEnd: day.date,
        sourceModules: ['day', 'disease', 'medicine', 'investigation', 'question'],
      });
      daily++;
    }
  }

  if (settings?.autoWeeklyBundle && days.length) {
    const weeks = Array.from(new Set(days.map((d) => weekKey(d.date))));
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
        sourceModules: ['day', 'disease', 'medicine', 'investigation', 'question'],
      });
      weekly++;
    }
  }

  return { daily, weekly };
}

/**
 * Process the pending-AI queue when the user is online and AI is configured.
 * Called when the browser fires the `online` event or manually.
 */
export async function processAiWhenOnline(): Promise<{ processed: number; failed: number }> {
  if (!navigator.onLine) return { processed: 0, failed: 0 };
  if (!aiAvailable()) return { processed: 0, failed: 0 };
  const pending = useData.getState().settings?.aiPendingBundles?.length ?? 0;
  if (!pending) return { processed: 0, failed: 0 };
  return processAiQueue();
}

/** Wire up auto-bundling + reconnection listener. Call once after init. */
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
  return () => window.removeEventListener('online', run);
}
