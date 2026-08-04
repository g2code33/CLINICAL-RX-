// CLINICAL Rx — service worker for offline-first web (PWA) support.
// HARDENED (v2):
//  - Never cache a non-200 / non-HTML navigation response (a cached deploy
//    error page used to get served later as a "stale shell" -> blank app).
//  - Only ever fall back to a cached shell that actually contains our mount
//    point (id="root"); otherwise show a clear offline message.
//  - Cache version is bumped so stale entries from previous versions are
//    purged on activate.
const CACHE = 'clinical-rx-v2';

self.addEventListener('install', () => {
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
  if (url.origin !== self.location.origin) return; // don't touch API/AI calls

  // Navigation: network-first. Cache ONLY a genuine 200 HTML response.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const isHtml = (res.headers.get('content-type') || '').includes('text/html');
          if (res.ok && isHtml) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => {
            if (!cached) return offlinePage();
            return cached.clone().text().then((t) => (t.includes('id="root"') ? cached : offlinePage())).catch(() => offlinePage());
          })
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate, cache only 200s.
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

function offlinePage() {
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h2>📵 You are offline</h2><p style="color:#94a3b8">CLINICAL Rx needs a connection to load. Reconnect and reload.</p></div></body>',
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}
