import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/* ==========================================================================
   KeepAlive — page-instance cache for React Router v6.

   Architecture:
   • <KeepAlive routes={...} />  → returns <Route>s (one per cached path) whose
     elements are <KaSlot/> placeholders. Drop these INSIDE <Routes> so React
     Router picks the right match for every URL and the catch-all `*` never
     hijacks tab navigation.
   • <KeepAliveCache routes={...} />  → mounts OUTSIDE <Routes>. It owns the
     actual page instances (one per visited path), all mounted simultaneously;
     inactive ones are hidden with display:none. A tiny subscription bridge
     forwards the active-path from <KaSlot> to the cache so the right page
     shows.

   The split is required because <Routes> only discovers <Route> children that
   appear as JSX in its own children tree — it will NOT unwrap the render
   output of a component to find <Route>s, so we CANNOT just emit <Route>s
   from a component and expect them to match. But we also CAN'T mount page
   instances inside those <Route>s because React Router unmounts the previous
   route's element on every navigation, killing state. Hence the two-piece
   design: Routes do matching, Cache owns instances.

   Usage:
     <Routes>
       <KeepAlive routes={keepAliveRoutes} />
       <Route path="/auth" element={<AuthPage />} />
       <Route path="*" element={<Navigate to="/" replace />} />
     </Routes>
     <KeepAliveCache routes={keepAliveRoutes} />
   ========================================================================== */

/** Fire cb every time the page is navigated BACK to (i.e. becomes visible). */
export function useOnPageShow(cb: () => void) {
  useEffect(() => {
    const p = normalize(location.pathname);
    function handler() { cb(); }
    document.addEventListener('ka:show:' + p, handler);
    return () => document.removeEventListener('ka:show:' + p, handler);
  }, [cb]);
}

function normalize(p: string): string {
  if (!p) return '/';
  return p.replace(/\/+$/g, '') || '/';
}

function fireShow(path: string) {
  document.dispatchEvent(new CustomEvent('ka:show:' + path));
}

const SCROLL_KEY = (p: string) => 'ka:s:' + p;

function nthPath(el: HTMLElement, root: HTMLElement): string {
  if (el === root) return '__root__';
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root && cur.parentElement) {
    const parent: HTMLElement = cur.parentElement;
    const sameTag = Array.from(parent.children).filter((c): c is Element => (c as Element).tagName === cur!.tagName);
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${sameTag.indexOf(cur) + 1})`);
    cur = parent;
  }
  return parts.join('>');
}

function saveScrolls(root: HTMLElement) {
  try {
    const map: Record<string, number> = {};
    const all = root.querySelectorAll<HTMLElement>('*');
    all.forEach((el) => {
      if (el.scrollHeight - el.clientHeight > 8) map[nthPath(el, root)] = el.scrollTop;
    });
    map['__window__'] = window.scrollY;
    sessionStorage.setItem(SCROLL_KEY(root.getAttribute('data-ka-path') || '/'), JSON.stringify(map));
  } catch { /* ignore */ }
}

function restoreScrolls(root: HTMLElement) {
  requestAnimationFrame(() => {
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY(root.getAttribute('data-ka-path') || '/'));
      if (!raw) return;
      const map: Record<string, number> = JSON.parse(raw);
      const all = root.querySelectorAll<HTMLElement>('*');
      all.forEach((el) => {
        const k = nthPath(el, root);
        if (map[k] != null) el.scrollTop = map[k];
      });
      if (map['__window__'] != null) window.scrollTo({ top: map['__window__'] });
    } catch { /* ignore */ }
  });
}

/* ---- Tiny pub/sub between <KaSlot> (inside Routes) and the cache -------- */
type Listener = (path: string) => void;
const listeners = new Set<Listener>();
let currentPath = normalize(window.location.pathname);
function emit(p: string) {
  currentPath = p;
  listeners.forEach((l) => l(p));
}
function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(currentPath);
  return () => listeners.delete(l);
}

/* ---- <KaSlot>  → element used by keep-alive <Route>s inside <Routes> ---- */
/**
 * Element rendered by each keep-alive <Route> inside <Routes>. It doesn't
 * render any UI (the real page lives in <KeepAliveCache> outside Routes).
 * Its only job is to tell the cache "this path just became the active match".
 */
export function KaSlot({ path }: { path: string }) {
  useEffect(() => {
    emit(normalize(path));
  }, [path]);
  return null;
}

/* ---- <KeepAliveCache>  → mounts page instances outside <Routes> --------- */

/** Drop OUTSIDE <Routes> (sibling is fine) — owns the cached page instances. */
export function KeepAliveCache({ routes }: {
  routes: { path: string; element: ReactNode }[];
}) {
  const loc = useLocation();
  const activeFromUrl = normalize(loc.pathname);
  const [activePath, setActivePath] = useState<string>(() => activeFromUrl);
  const [visited, setVisited] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    init[activeFromUrl] = true;
    return init;
  });
  const rootsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const prev = useRef<string>(activeFromUrl);


  const isOnCachedRoute = routes.some((r) => normalize(r.path) === activeFromUrl);

  // Track active path both from URL changes and from KaSlot announcements.
  useEffect(() => {
    // Only switch the visible cached page when the URL actually matches one of
    // our keep-alive routes. On transient routes (/auth, /reset, unknown/*)
    // we leave activePath as-is so instances stay mounted — but we hide the
    // entire cache below via the isOnCachedRoute flag.
    if (isOnCachedRoute) setActivePath(activeFromUrl);
  }, [activeFromUrl, isOnCachedRoute]);

  useEffect(() => subscribe((p) => {
    setActivePath(p);
    setVisited((v) => (v[p] ? v : { ...v, [p]: true }));
  }), []);

  useEffect(() => {
    if (prev.current === activePath) return;
    const prevRoot = rootsRef.current[prev.current];
    if (prevRoot) saveScrolls(prevRoot);
    const nextRoot = rootsRef.current[activePath];
    if (nextRoot) {
      restoreScrolls(nextRoot);
      fireShow(activePath);
    }
    prev.current = activePath;
  }, [activePath]);

  useEffect(() => {
    const tick = () => {
      const root = rootsRef.current[activePath];
      if (root) saveScrolls(root);
    };
    const id = setInterval(tick, 1500);
    window.addEventListener('beforeunload', tick);
    return () => { clearInterval(id); window.removeEventListener('beforeunload', tick); };
  }, [activePath]);

  return (
    <div style={{ display: isOnCachedRoute ? 'contents' : 'none' }} aria-hidden={!isOnCachedRoute}>
      {routes.map(({ path, element }) => {
        const np = normalize(path);
        const isActive = activePath === np;
        const wasVisited = !!visited[np];
        if (!wasVisited && !isActive) return null;
        return (
          <div
            key={path}
            ref={(el) => { rootsRef.current[np] = el; }}
            data-ka-path={np}
            style={{ display: isActive ? 'contents' : 'none' }}
            aria-hidden={!isActive}
          >
            {element}
          </div>
        );
      })}
    </div>
  );
}
