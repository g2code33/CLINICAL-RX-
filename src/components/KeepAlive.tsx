import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

/* ==========================================================================
   KeepAlive — wraps a set of <Route>s such that each matched page stays
   mounted (with display:none) after you navigate away, instead of being
   unmounted. This preserves local state, scroll positions, half-filled
   inputs, in-flight AI streams, quiz timers etc. across tab switches.

   Usage:
     <Routes>
       <KeepAlive routes={[
         { path: '/', element: <Dashboard /> },
         { path: '/quiz', element: <Quiz /> },
         ...
       ]} />
       <Route path="/auth" element={<AuthPage />} />
       <Route path="*" element={<Navigate to="/" replace />} />
     </Routes>
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

/** Caches one instance per path and shows/hides it based on current location. */
export function KeepAlive({ routes, transient = [] }: {
  routes: { path: string; element: ReactNode }[];
  transient?: { path: string; element: ReactNode }[];
}) {
  const loc = useLocation();
  const activePath = normalize(loc.pathname);
  const [visited, setVisited] = useState<Record<string, boolean>>(() => ({}));
  const rootsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const prev = useRef<string>('');

  // Seed current path.
  useEffect(() => {
    setVisited((v) => v[activePath] ? v : { ...v, [activePath]: true });
    prev.current = activePath;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visited[activePath]) setVisited((v) => ({ ...v, [activePath]: true }));
  }, [activePath, visited]);

  useEffect(() => {
    if (prev.current === activePath) return;
    const prevRoot = rootsRef.current[prev.current];
    if (prevRoot) saveScrolls(prevRoot);
    const nextRoot = rootsRef.current[activePath];
    if (nextRoot && visited[activePath]) {
      restoreScrolls(nextRoot);
      fireShow(activePath);
    }
    prev.current = activePath;
  }, [activePath, visited]);

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
    <>
      {/* Keep-alive routes — mount each once, then show/hide via display. We
          render them as <Route>s so React Router still handles URL matching
          (links, navigate, relative routes all keep working); the element is
          wrapped in a persistent host div that survives remounts of the Route
          because we keep every visited path's host mounted and only one Route
          matches at a time. */}
      {routes.map(({ path, element }) => (
        <Route
          key={path}
          path={path}
          element={
            <Keeper
              path={path}
              visited={visited[normalize(path)]}
              active={activePath === normalize(path)}
              registerRef={(el) => { rootsRef.current[normalize(path)] = el; }}
            >
              {element}
            </Keeper>
          }
        />
      ))}
      {transient.map(({ path, element }) => (
        <Route key={path} path={path} element={element} />
      ))}
    </>
  );
}

function Keeper({ path, active, visited, registerRef, children }: {
  path: string;
  active: boolean;
  visited: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  // Once visited, the children host stays in the DOM permanently; before
  // that we render nothing so the component doesn't mount on first load of
  // other tabs.
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (active && !mounted) setMounted(true);
  }, [active, mounted]);
  if (!mounted && !visited) return null;
  return (
    <div
      ref={registerRef}
      data-ka-path={normalize(path)}
      style={{ display: active ? 'contents' : 'none' }}
      aria-hidden={!active}
    >
      {mounted && children}
    </div>
  );
}
