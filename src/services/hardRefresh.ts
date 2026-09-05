// PWA/web refresh + cache-clear utility.
//
// "Hard refresh" in an installed PWA / cached SPA doesn't just mean reloading —
// you also have to nuke the service worker's caches, otherwise the app keeps
// serving the old shell. This helper:
//   1. Deregisters the current service worker.
//   2. Deletes every CACHE that starts with "clinical-rx-" (covers v3, future).
//   3. Clears unregistration race by waiting a tick, then reloads with a
//      cache-busting query parameter so browsers that ignore no-cache still
//      pull fresh assets.

export async function hardRefresh(clearCache = true): Promise<void> {
  try {
    if (clearCache && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch { /* ignore */ }

  try {
    if (clearCache && 'caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('clinical-rx-'))
          .map((k) => caches.delete(k))
      );
    }
  } catch { /* ignore */ }

  // Reload with a cache-bust. Using location.replace replaces the history entry
  // so the back button doesn't loop you back to the pre-refresh shell.
  const target = new URL(window.location.href);
  target.searchParams.set('_crx_refresh', String(Date.now()));
  window.location.replace(target.toString());
}

/** Is the app running as an installed PWA? Used to decide how aggressively
 *  to surface the refresh button (always visible in PWA, optional elsewhere). */
export function isStandalonePwa(): boolean {
  // @ts-ignore iOS Safari
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}
