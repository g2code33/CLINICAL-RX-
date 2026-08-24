import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import pkg from '../../package.json';
import { useData } from '../stores/data';
import { useUi } from '../stores/ui';
import { SearchModal } from './SearchModal';
import { SyncIndicator } from './SyncIndicator';
import { ShortcutHelp } from './ShortcutHelp';
import { CommandPalette } from './CommandPalette';
import { UpdateBadge } from './UpdateBadge';
import { UndoToast } from './UndoToast';
import { ContextMenuProvider } from './ContextMenu';
import { TaskIndicator } from './TaskIndicator';
import { NotificationBanner } from './NotificationBanner';

const APP_VERSION = pkg.version;

// ---- CLINICAL workspace navigation (unchanged) ----
const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/clinical', icon: '📋', label: 'Clinical Days' },
  { to: '/ward-rounds', icon: '🏥', label: 'Ward Rounds' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/diseases', icon: '🦠', label: 'Diseases' },
  { to: '/medicines', icon: '💊', label: 'Medicines' },
  { to: '/investigations', icon: '🧪', label: 'Investigations' },
  { to: '/questions', icon: '❓', label: 'Questions' },
  { to: '/revision', icon: '📚', label: 'Revision' },
  { to: '/quiz', icon: '📝', label: 'Quiz' },
  { to: '/question-bank', icon: '🗂', label: 'Question Bank' },
  { to: '/bundles', icon: '📦', label: 'Bundles' },
  { to: '/progress', icon: '📊', label: 'Progress' },
  { to: '/ai', icon: '🤖', label: 'AI' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

// ---- PHARMD workspace navigation (its own set + its own drawer) ----
const PHARMD_NAV = [
  { to: '/journey', icon: '🎓', label: 'My Journey' },
  { to: '/archive', icon: '🗂', label: 'Academic Archive' },
  { to: '/courses', icon: '📚', label: 'Courses' },
  { to: '/progress', icon: '📊', label: 'Progress' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

/** Routes that belong to BOTH workspaces, so they never force a mode change. */
const SHARED_ROUTES = ['/progress', '/settings', '/admin', '/auth', '/reset'];

const PHARMD_BOTTOM_NAV = [
  { to: '/journey', icon: '🎓', label: 'Journey' },
  { to: '/archive', icon: '🗂', label: 'Archive' },
  { to: '/courses', icon: '📚', label: 'Courses' },
  { to: '/progress', icon: '📊', label: 'Progress' },
];

// Fixed bottom navigation — the 6 most-used destinations + "More" (opens the drawer).
const BOTTOM_NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/clinical', icon: '📋', label: 'Days' },
  { to: '/ward-rounds', icon: '🏥', label: 'Rounds' },
  { to: '/medicines', icon: '💊', label: 'Meds' },
  { to: '/quiz', icon: '📝', label: 'Quiz' },
  { to: '/ai', icon: '🤖', label: 'AI' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ---- Workspace mode ----
  // One button switches the ENTIRE shell between the clinical companion and
  // the PharmD journey. Each mode has its own sidebar, drawer and bottom nav.
  const appMode = useUi((s) => s.appMode);
  const toggleAppMode = useUi((s) => s.toggleAppMode);
  const setAppMode = useUi((s) => s.setAppMode);
  const isPharmd = appMode === 'pharmd';
  const navItems = isPharmd ? PHARMD_NAV : NAV;
  const bottomItems = isPharmd ? PHARMD_BOTTOM_NAV : BOTTOM_NAV;
  const workspaceName = isPharmd ? 'PharmD Journey' : 'Clinical Companion';

  function switchMode() {
    const next = toggleAppMode();
    setDrawerOpen(false);
    // Land on the new workspace's home so the user is never left on a page
    // that doesn't belong to the mode they just switched into.
    navigate(next === 'pharmd' ? '/journey' : '/');
  }

  const profile = useData((s) => s.profile);
  const searchOpen = useUi((s) => s.searchOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setHelpOpen = useUi((s) => s.setHelpOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const setSidebarOpen = useUi((s) => s.setSidebarOpen);
  const connected = useData((s) => s.settings?.onlineAccount?.connected);
  const syncing = useData((s) => s.settings?.onlineAccount?.syncing);
  const pending = useData((s) => s.removed.length); // lightweight re-render driver

  const [beepOn, setBeepOn] = useState(true);

  // Safety net: the drawer always closes on route change (also covers taps on
  // drawer links, which close immediately via onClick for a snappy feel).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Keep the shell in step with the route. Jumping straight to a PharmD page
  // (global search, command palette, a deep link) flips the workspace, and
  // vice versa — so the nav on screen always matches the page being shown.
  useEffect(() => {
    const path = location.pathname;
    const pharmdOnly = PHARMD_NAV.map((n) => n.to).filter((t) => !SHARED_ROUTES.includes(t));
    const inPharmd = pharmdOnly.some((t) => path === t || path.startsWith(t + '/'));
    const shared = SHARED_ROUTES.some((t) => path === t || path.startsWith(t + '/'));
    if (inPharmd && appMode !== 'pharmd') setAppMode('pharmd');
    else if (!inPharmd && !shared && appMode !== 'clinical') setAppMode('clinical');
  }, [location.pathname, appMode, setAppMode]);

  // While the drawer is open: lock body scroll + close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  return (
    <ContextMenuProvider>
      <div className="app-shell flex flex-col overflow-hidden bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100 lg:flex-row">
        {/* ================= DESKTOP SIDEBAR (lg+) ================= */}
        {sidebarOpen ? (
          <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:flex">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-5 dark:border-slate-700">
              <img src="./v2.PNG" alt="CLINICAL Rx logo" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="truncate text-base font-extrabold tracking-tight text-brand-700 dark:text-brand-300">
                  CLINICAL Rx
                </div>
                <div className="text-[11px] text-slate-400">v{APP_VERSION} · {workspaceName}</div>
              </div>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <span className="text-lg leading-none">{n.icon}</span>
                  <span className="truncate">{n.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="space-y-2 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
              <button
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  isPharmd
                    ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-300'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300'
                }`}
                onClick={switchMode}
                title={isPharmd ? 'Back to the clinical workspace' : 'Open the PharmD journey workspace'}
              >
                <span className="text-lg leading-none">{isPharmd ? '🩺' : '🎓'}</span>
                <span className="truncate">{isPharmd ? 'Clinical Journey' : 'PharmD Journey'}</span>
                <span className="ml-auto text-xs opacity-60">⇄</span>
              </button>
              <div className="px-2 text-[11px] text-slate-400">Offline-first · works without internet</div>
            </div>
          </aside>
        ) : (
          <aside className="hidden w-16 shrink-0 flex-col border-r border-slate-200 bg-white py-2 dark:border-slate-700 dark:bg-slate-900 lg:flex">
            <div className="mb-2 flex justify-center">
              <img src="./v2.PNG" alt="CLINICAL Rx" className="h-9 w-9 rounded-xl object-cover" />
            </div>
            <nav className="flex flex-1 flex-col items-stretch gap-1 px-1.5">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  title={n.label}
                  className={({ isActive }) =>
                    `flex min-h-11 flex-1 items-center justify-center rounded-xl text-[22px] transition-colors ${
                      isActive ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <span>{n.icon}</span>
                </NavLink>
              ))}
            </nav>
          </aside>
        )}

        {/* ================= MAIN COLUMN ================= */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* -------- Top header (mobile + desktop) -------- */}
          <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:px-4 lg:h-16 lg:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {/* Hamburger — mobile opens the drawer, desktop toggles the sidebar */}
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xl leading-none text-slate-600 transition active:scale-95 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
                onClick={() => (window.innerWidth < 1024 ? setDrawerOpen(true) : setSidebarOpen(!sidebarOpen))}
                aria-label="Open navigation menu"
                title="Menu"
              >
                ☰
              </button>

              <img src="./v2.PNG" alt="CLINICAL Rx" className="h-8 w-8 shrink-0 rounded-xl object-cover" />
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[15px] font-extrabold tracking-tight text-brand-700 dark:text-brand-300 sm:text-lg">
                  CLINICAL Rx
                </span>
                <span className="hidden rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:inline">
                  v{APP_VERSION}
                </span>
              </div>

              {/* ONE-BUTTON WORKSPACE SWITCH.
                  Clinical mode  -> shows "PharmD Journey" (switches to it)
                  PharmD mode    -> shows "Clinical Journey" (switches back) */}
              <button
                onClick={switchMode}
                title={isPharmd ? 'Switch back to the Clinical workspace' : 'Switch to the PharmD Journey workspace'}
                aria-label={isPharmd ? 'Switch to Clinical Journey' : 'Switch to PharmD Journey'}
                className={`ml-1 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95 sm:ml-2 sm:px-3.5 ${
                  isPharmd
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                <span className="text-sm leading-none">{isPharmd ? '🩺' : '🎓'}</span>
                <span className="hidden whitespace-nowrap sm:inline">
                  {isPharmd ? 'Clinical Journey' : 'PharmD Journey'}
                </span>
                <span className="text-[10px] opacity-70">⇄</span>
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1 lg:gap-2">
              {/* Live status: green = cloud connected, amber = syncing/pending, slate = local-only.
                  Click toggles the pulse "beep". */}
              <button
                className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium transition active:bg-slate-100 dark:active:bg-slate-800 sm:px-3"
                onClick={() => setBeepOn((v) => !v)}
                title={beepOn ? 'Status beep on — click to silence' : 'Status beep off — click to enable'}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    connected ? 'bg-emerald-500' : syncing ? 'bg-amber-500' : pending > 0 ? 'bg-amber-400' : 'bg-slate-400'
                  } ${beepOn && (connected || syncing || pending > 0) ? 'animate-pulse' : ''}`}
                />
                <span className="hidden text-slate-500 dark:text-slate-400 sm:inline">
                  {connected ? 'Cloud' : syncing ? 'Syncing' : pending > 0 ? 'Pending' : 'Local'}
                </span>
              </button>

              <UpdateBadge />
              <SyncIndicator />

              <button
                className="btn-ghost hidden h-9 w-9 items-center justify-center !px-0 !py-0 text-lg lg:flex"
                onClick={() => setSearchOpen(true)}
                title="Global search (Ctrl/⌘+K)"
              >
                🔍
              </button>
              <button
                className="btn-ghost hidden h-9 w-9 items-center justify-center !px-0 !py-0 text-lg lg:flex"
                onClick={() => setHelpOpen(true)}
                title="Keyboard shortcuts (?)"
              >
                ?
              </button>
              <button
                className="btn-ghost hidden h-9 w-9 items-center justify-center !px-0 !py-0 text-base lg:flex"
                onClick={() => setPaletteOpen(true)}
                title="Command palette (Ctrl+P)"
              >
                ⌘
              </button>

              <div className="hidden whitespace-nowrap text-xs text-slate-400 lg:block">
                Day {profile?.clinicalDay ?? 1}
                {profile?.site ? ` · ${profile.site}` : ''}
              </div>
            </div>
          </header>

          {/* -------- Content -------- */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
              {children}
            </div>
          </main>
        </div>

        {/* ================= MOBILE SLIDE-IN DRAWER ================= */}
        <div
          className={`fixed inset-0 z-[60] transition-opacity duration-300 lg:hidden ${
            drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={!drawerOpen}
        >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${
              drawerOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => setDrawerOpen(false)}
          />

          {/* Panel — slides in from the left */}
          <aside
            className={`absolute inset-y-0 left-0 flex w-80 max-w-[85%] transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-slate-900 ${
              drawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex min-w-0 items-center gap-3">
                <img src="./v2.PNG" alt="CLINICAL Rx logo" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold tracking-tight text-brand-700 dark:text-brand-300">
                    CLINICAL Rx
                  </div>
                  <div className="text-[11px] text-slate-400">
                    v{APP_VERSION} · {workspaceName}
                  </div>
                </div>
              </div>
              <button
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>

            {/* Drawer nav — tapping any item closes the drawer automatically */}
            <nav className="flex-1 overflow-y-auto py-2">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex w-full items-center gap-4 px-5 py-[15px] text-left transition-all duration-150 active:scale-[0.98] ${
                      isActive
                        ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <span className="w-8 shrink-0 text-center text-xl leading-none">{n.icon}</span>
                  <span className="truncate text-[15px]">{n.label}</span>
                  {location.pathname === n.to && (
                    <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Drawer footer */}
            <div className="border-t border-slate-200 px-5 py-4 text-center text-xs text-slate-400 dark:border-slate-700">
              <div className="font-medium">CLINICAL Rx · v{APP_VERSION}</div>
              <div className="mt-0.5">{isPharmd ? 'Your academic journey, kept for good' : 'Offline-first clinical companion'}</div>
            </div>
          </aside>
        </div>

        {/* ================= FIXED BOTTOM NAV (mobile only) ================= */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 lg:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)' }}
        >
          <div className="flex items-stretch justify-around gap-0.5 px-1 pt-1.5">
            {bottomItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `flex min-w-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                      : 'text-slate-400 active:bg-slate-100 dark:text-slate-500 dark:active:bg-slate-800'
                  }`
                }
              >
                <span className="text-[21px] leading-none">{n.icon}</span>
                <span className="text-[9.5px] font-semibold tracking-tight">{n.label}</span>
              </NavLink>
            ))}

            {/* "More" opens the full drawer */}
            <button
              className={`flex min-w-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95 ${
                drawerOpen
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-slate-400 active:bg-slate-100 dark:text-slate-500 dark:active:bg-slate-800'
              }`}
              onClick={() => setDrawerOpen(true)}
            >
              <span className="text-[21px] leading-none">⋯</span>
              <span className="text-[9.5px] font-semibold tracking-tight">More</span>
            </button>
          </div>
        </nav>

        {/* Modals & overlays */}
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <ShortcutHelp />
        <CommandPalette />
        <UndoToast />
        <TaskIndicator />
        <NotificationBanner />
      </div>
    </ContextMenuProvider>
  );
}
