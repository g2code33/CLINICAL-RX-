import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useData } from '../stores/data';
import { useUi } from '../stores/ui';
import { SearchModal } from './SearchModal';
import { SyncIndicator } from './SyncIndicator';
import { ShortcutHelp } from './ShortcutHelp';
import { CommandPalette } from './CommandPalette';
import { UpdateBadge } from './UpdateBadge';

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/clinical', icon: '📋', label: 'Clinical Days' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/diseases', icon: '🦠', label: 'Diseases' },
  { to: '/medicines', icon: '💊', label: 'Medicines' },
  { to: '/investigations', icon: '🧪', label: 'Investigations' },
  { to: '/questions', icon: '❓', label: 'Questions' },
  { to: '/revision', icon: '📚', label: 'Revision' },
  { to: '/bundles', icon: '📦', label: 'Bundles' },
  { to: '/progress', icon: '📊', label: 'Progress' },
  { to: '/ai', icon: '🤖', label: 'AI' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

// Shown in the mobile bottom bar (keep it short).
const MOBILE_NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/clinical', icon: '📋', label: 'Days' },
  { to: '/medicines', icon: '💊', label: 'Medicines' },
  { to: '/bundles', icon: '📦', label: 'Bundles' },
  { to: '/ai', icon: '🤖', label: 'AI' },
];

export function Layout({ children }: { children: ReactNode }) {
  const status = useData((s) => s.status);
  const profile = useData((s) => s.profile);
  const searchOpen = useUi((s) => s.searchOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setHelpOpen = useUi((s) => s.setHelpOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100 lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 lg:flex">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4 dark:border-slate-700">
          <img src="./v1.PNG" alt="CLINICAL Rx" className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <div className="text-sm font-extrabold tracking-tight text-brand-700 dark:text-brand-300">CLINICAL Rx</div>
            <div className="text-[11px] text-slate-400">Clinical Companion</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-600 font-semibold text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          👤 {profile?.username}
          <div className="mt-0.5 text-[11px] text-slate-400">
            {profile?.programme} · Level {profile?.level} · {profile?.site}
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 lg:px-6 lg:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img src="./v1.PNG" alt="CLINICAL Rx" className="h-7 w-7 rounded-lg object-cover lg:hidden" />
            <div className="truncate text-sm font-medium text-slate-500 dark:text-slate-300">
              🟢 <span className="hidden sm:inline">{status}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:gap-3">
            <UpdateBadge />
            <SyncIndicator />
            <button className="btn-ghost !py-1 text-sm" onClick={() => setSearchOpen(true)} title="Global search (Ctrl/⌘+K)">
              🔍
            </button>
            <button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
              ?
            </button>
            <button className="btn-ghost !px-2 !py-1 text-sm lg:hidden" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+P)">
              ⌘
            </button>
            <div className="hidden text-xs text-slate-400 lg:block">
              Clinical Day {profile?.clinicalDay ?? 1} · {profile?.site}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 lg:p-6">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="flex shrink-0 items-stretch justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-800 lg:hidden">
        {MOBILE_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutHelp />
      <CommandPalette />
    </div>
  );
}
