import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
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

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/clinical', icon: '📋', label: 'Clinical Days' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/diseases', icon: '🦠', label: 'Diseases' },
  { to: '/medicines', icon: '💊', label: 'Medicines' },
  { to: '/investigations', icon: '🧪', label: 'Investigations' },
  { to: '/questions', icon: '❓', label: 'Questions' },
  { to: '/revision', icon: '📚', label: 'Revision' },
  { to: '/quiz', icon: '📝', label: 'Quiz' },
  { to: '/question-bank', icon: '🗂️', label: 'Question Bank' },
  { to: '/bundles', icon: '📦', label: 'Bundles' },
  { to: '/progress', icon: '📊', label: 'Progress' },
  { to: '/ai', icon: '🤖', label: 'AI' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

// Clean & modern bottom navigation for mobile (most used items)
const BOTTOM_NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/clinical', icon: '📋', label: 'Days' },
  { to: '/diseases', icon: '🦠', label: 'Diseases' },
  { to: '/medicines', icon: '💊', label: 'Meds' },
  { to: '/quiz', icon: '📝', label: 'Quiz' },
  { to: '/ai', icon: '🤖', label: 'AI' },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const profile = useData((s) => s.profile);
  const searchOpen = useUi((s) => s.searchOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setHelpOpen = useUi((s) => s.setHelpOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const setSidebarOpen = useUi((s) => s.setSidebarOpen);
  
  const connected = useData((s) => s.settings?.onlineAccount?.connected);
  const syncing = useData((s) => s.settings?.onlineAccount?.syncing);
  const pending = useData((s) => s.removed.length);

  const [beepOn, setBeepOn] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer when route changes (important for mobile UX)
  const handleNavClick = (to: string) => {
    setDrawerOpen(false);
    // Small delay so the animation feels smooth
    setTimeout(() => {
      navigate(to);
    }, 80);
  };

  const isActive = (path: string) => location.pathname === path || (path === '/' && location.pathname === '/');

  return (
    <ContextMenuProvider>
      <div className="flex h-screen flex-col bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
        
        {/* ========== TOP HEADER (Mobile + Desktop) ========== */}
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-lg dark:border-slate-700 dark:bg-slate-900/95 lg:h-16 lg:px-6">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu */}
            <button
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800 lg:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <img src="./v2.PNG" alt="CLINICAL Rx" className="h-8 w-8 rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700" />
              <div className="hidden sm:block">
                <div className="text-lg font-extrabold tracking-tighter text-brand-700 dark:text-brand-300">CLINICAL Rx</div>
                <div className="text-[10px] -mt-1 text-slate-400">v1.3.6</div>
              </div>
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            {/* Status indicator */}
            <button 
              onClick={() => setBeepOn(!beepOn)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:bg-slate-100 dark:active:bg-slate-800"
            >
              <div className={`h-2.5 w-2.5 rounded-full ${
                connected ? 'bg-emerald-500' : syncing ? 'bg-amber-500' : pending > 0 ? 'bg-amber-400' : 'bg-slate-400'
              } ${beepOn && (connected || syncing || pending > 0) ? 'animate-pulse' : ''}`} />
              <span className="hidden text-slate-500 dark:text-slate-400 sm:inline">
                {connected ? 'Cloud' : syncing ? 'Syncing' : 'Local'}
              </span>
            </button>

            <UpdateBadge />
            <SyncIndicator />

            <button 
              onClick={() => setSearchOpen(true)} 
              className="btn-ghost hidden h-9 w-9 items-center justify-center text-lg lg:flex"
            >
              🔍
            </button>
            
            <button 
              onClick={() => setHelpOpen(true)} 
              className="btn-ghost hidden h-9 w-9 items-center justify-center text-lg lg:flex"
            >
              ?
            </button>

            <div className="hidden items-center gap-2 pl-2 text-xs text-slate-500 lg:flex">
              Day {profile?.clinicalDay ?? 1}
            </div>
          </div>
        </header>

        {/* ========== SLIDE-IN DRAWER (Mobile) ========== */}
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-[60] bg-black/60 lg:hidden" 
              onClick={() => setDrawerOpen(false)}
            />
            
            {/* Drawer Panel */}
            <div className="fixed inset-y-0 left-0 z-[70] w-80 max-w-[85%] transform bg-white shadow-2xl transition-transform duration-300 dark:bg-slate-900 lg:hidden">
              <div className="flex h-full flex-col">
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <img src="./v2.PNG" alt="Logo" className="h-9 w-9 rounded-xl" />
                    <div>
                      <div className="font-bold text-lg">CLINICAL Rx</div>
                      <div className="text-xs text-slate-400">Clinical Companion</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setDrawerOpen(false)}
                    className="text-3xl text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>

                {/* Navigation Links */}
                <div className="flex-1 overflow-y-auto py-2">
                  {NAV.map((item) => (
                    <button
                      key={item.to}
                      onClick={() => handleNavClick(item.to)}
                      className={`flex w-full items-center gap-4 px-6 py-[17px] text-left transition-all active:bg-slate-100 dark:active:bg-slate-800 ${
                        isActive(item.to) 
                          ? 'bg-brand-50 text-brand-700 font-semibold dark:bg-brand-950 dark:text-brand-300' 
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-2xl w-8">{item.icon}</span>
                      <span className="text-[15px]">{item.label}</span>
                    </button>
                  ))}
                </div>

                {/* Drawer Footer */}
                <div className="border-t border-slate-200 p-5 text-center text-xs text-slate-400 dark:border-slate-700">
                  clinicalrx30.vercel.app
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========== DESKTOP SIDEBAR (lg+) ========== */}
        <div className="hidden lg:flex">
          <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-slate-700">
              <img src="./v2.PNG" alt="Logo" className="h-9 w-9 rounded-2xl" />
              <div>
                <div className="font-bold tracking-tight">CLINICAL Rx</div>
                <div className="text-[10px] text-slate-400">v1.3.6</div>
              </div>
            </div>

            <nav className="flex-1 space-y-0.5 p-3 overflow-auto">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive: active }) =>
                    `flex items-center gap-3.5 px-4 py-3 text-sm font-medium rounded-2xl transition-all ${
                      active 
                        ? 'bg-brand-600 text-white shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>

        {/* ========== MAIN CONTENT ========== */}
        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <div className="max-w-7xl mx-auto px-4 py-5 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>

        {/* ========== FIXED BOTTOM NAV (Mobile only) ========== */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 lg:hidden">
          <div className="flex items-center justify-around px-1 py-1.5">
            {BOTTOM_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive: active }) =>
                  `flex flex-col items-center justify-center px-4 py-1.5 text-center transition-all active:scale-95 rounded-xl min-w-[58px] ${
                    active 
                      ? 'text-brand-600' 
                      : 'text-slate-500 dark:text-slate-400'
                  }`
                }
              >
                <span className="text-2xl mb-0.5">{item.icon}</span>
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </NavLink>
            ))}
            
            {/* More button opens full drawer */}
            <button 
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center justify-center px-4 py-1.5 text-center text-slate-500 dark:text-slate-400 active:scale-95 rounded-xl min-w-[58px]"
            >
              <span className="text-2xl mb-0.5">⋯</span>
              <span className="text-[10px] font-medium tracking-tight">More</span>
            </button>
          </div>
        </nav>

        {/* Modals */}
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
