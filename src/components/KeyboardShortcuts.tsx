import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../stores/ui';

// G-key "leader" state: press g then a key to jump to a page.
let leader = false;
let leaderTimer: ReturnType<typeof setTimeout> | null = null;

const LEADER_ROUTES: Record<string, string> = {
  h: '/',
  d: '/clinical',
  c: '/calendar',
  m: '/medicines',
  q: '/questions',
  r: '/revision',
  b: '/bundles',
  p: '/progress',
  a: '/ai',
  y: '/journey/health-apis',
  j: '/journey',
  s: '/settings',
};

export function KeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      // Ignore most shortcuts while typing, except Ctrl/Cmd combos.
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd+K -> command bar (navigate / search records / ask AI / act)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.getState().setPaletteOpen(true);
        return;
      }

      // Ctrl/Cmd+Shift+F -> classic full-text search modal
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        useUi.getState().setSearchOpen(true);
        return;
      }

      // Ctrl/Cmd+Shift+H -> My Health APIs workbench
      if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        navigate('/journey/health-apis');
        return;
      }

      if (typing && !mod) return;

      // Ctrl/Cmd+N -> new record IN THE CURRENT CONTEXT (§28).
      // On a module page this opens that module's create form; anywhere else
      // it falls back to the clinical day capture.
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const path = window.location.hash.replace(/^#/, '') || window.location.pathname;
        const CREATABLE = ['/notes', '/questions', '/medicines', '/diseases', '/investigations', '/courses'];
        const match = CREATABLE.find((r) => path.startsWith(r));
        if (match) navigate(`${match}?new=1`);
        else if (path.startsWith('/ward-rounds')) navigate('/ward-rounds');
        else if (path.startsWith('/bundles')) navigate('/bundles');
        else navigate('/clinical');
        return;
      }

      // Ctrl/Cmd+, -> settings
      if (mod && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }

      // Ctrl/Cmd+P -> command palette
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        useUi.getState().setPaletteOpen(true);
        return;
      }

      // g <key> leader navigation (when not typing)
      if (!mod) {
        if (e.key === '?') {
          e.preventDefault();
          useUi.getState().setHelpOpen(true);
          return;
        }
        if (e.key.toLowerCase() === 'g') {
          leader = true;
          if (leaderTimer) clearTimeout(leaderTimer);
          leaderTimer = setTimeout(() => (leader = false), 1500);
          return;
        }
        if (leader) {
          leader = false;
          if (leaderTimer) clearTimeout(leaderTimer);
          const key = e.key.toLowerCase();
          const route = LEADER_ROUTES[key];
          if (route) {
            e.preventDefault();
            navigate(route);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return null;
}
