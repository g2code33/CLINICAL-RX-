// CLINICAL Rx — service worker for offline-first web (PWA) support.
//
// The app is OFFLINE-FIRST: the whole UI must load and run with no network;
// only cloud sync/AI need a connection (and those are never cached here).
// Strategy:
//  - Precache the app shell at install (index.html).
//  - Navigation: serve the cached shell FIRST (instant, works offline),
//    then refresh it in the background when online.
//  - Static assets: cache-first with background refresh.
//  - NEVER intercept cross-origin API/AI calls.
const CACHE = 'clinical-rx-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add('/index.html')).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch API/AI calls

  // Navigation: cache-first (the app must open instantly & offline), then
  // update the cached copy in the background when the network is available.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const isHtml = (res.headers.get('content-type') || '').includes('text/html');
            if (res.ok && isHtml) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
