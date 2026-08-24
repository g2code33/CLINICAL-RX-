import { useData } from '../stores/data';
import { processAiQueue, aiAvailable } from './bundler';

/**
 * Automatic bundling now delegates to the Phase 4 snapshot engine.
 *
 * The old implementation located an existing bundle for a period and
 * overwrote it with fresh live data — which silently rewrote history. The
 * engine instead creates immutable snapshots guarded by a deterministic
 * autoKey, so a period is bundled exactly once and never mutated afterwards.
 */
export async function runAutoBundling(): Promise<{ daily: number; weekly: number }> {
  const { runAutomaticBundling } = await import('./bundleEngine');
  const r = await runAutomaticBundling();
  return { daily: r.daily, weekly: r.weekly };
}

/**
 * Process the pending-AI queue when AI is configured. Also auto-triggers a
 * bundle for TODAY's clinical day if one hasn't been made yet (daily
 * automation the moment you record something).
 */
export async function processAiWhenOnline(): Promise<{ processed: number; failed: number }> {
  // Today is deliberately NOT auto-bundled: the day isn't finished yet.
  // Completed days/weeks are caught up by runAutoBundling() at startup.
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
