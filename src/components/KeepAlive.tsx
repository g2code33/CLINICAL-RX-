import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/* ==========================================================================
   KeepAlive — mounts each listed route ONCE on first visit, hides it with
   display:none on navigate-away, shows it on return. This preserves:
     - local React state (drafts, selected items, open panels, filters, answers)
     - DOM state (scroll positions of every scrollable container, focus, input values)
     - in-flight async work (AI streams, quiz timers, uploads)
   Hidden pages: display:none → no paint/layout cost, aria-hidden, not focusable.
   Non-listed routes mount fresh each time (used for /auth, /reset etc.).
   ========================================================================== */

/** Fire `cb` every time the page is navigated back to (i.e. shown again). */
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
      if (el.scrollHeight - el.clientHeight > 8) {
        map[nthPath(el, root)] = el.scrollTop;
      }
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

export function KeepAlive({ routes }: { routes: { path: string; element: ReactNode }[] }) {
  const loc = useLocation();
  const activePath = normalize(loc.pathname);
  const [visited, setVisited] = useState<Record<string, boolean>>(() => ({}));
  const rootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prev = useRef<string>('');

  // Seed: mark current path as visited on first render.
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
    const prevRoot = rootRefs.current[prev.current];
    if (prevRoot) saveScrolls(prevRoot);
    const nextRoot = rootRefs.current[activePath];
    if (nextRoot && visited[activePath]) {
      restoreScrolls(nextRoot);
      fireShow(activePath);
    }
    prev.current = activePath;
  }, [activePath, visited]);

  // Periodic scroll save while a page is visible, plus on beforeunload.
  useEffect(() => {
    const tick = () => {
      const root = rootRefs.current[activePath];
      if (root) saveScrolls(root);
    };
    const id = setInterval(tick, 1500);
    window.addEventListener('beforeunload', tick);
    return () => { clearInterval(id); window.removeEventListener('beforeunload', tick); };
  }, [activePath]);

  return (
    <>
      {routes.map(({ path, element }) => {
        const key = normalize(path);
        if (!visited[key]) return null;
        const isActive = activePath === key;
        return (
          <div
            key={key}
            ref={(el) => { rootRefs.current[key] = el; }}
            data-ka-path={key}
            style={{ display: isActive ? 'contents' : 'none' }}
            aria-hidden={!isActive}
          >
            {element}
          </div>
        );
      })}
    </>
  );
}
