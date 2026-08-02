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

      // Ctrl/Cmd+K -> search
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.getState().setSearchOpen(true);
        return;
      }

      if (typing && !mod) return;

      // Ctrl/Cmd+N -> Quick capture (clinical day)
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        navigate('/clinical');
        return;
      }

      // Ctrl/Cmd+, -> settings
      if (mod && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
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
