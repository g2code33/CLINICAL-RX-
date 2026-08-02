import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useData } from '../stores/data';
import { useUi } from '../stores/ui';
import { SearchModal } from './SearchModal';
import { SyncIndicator } from './SyncIndicator';

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

export function Layout({ children }: { children: ReactNode }) {
  const status = useData((s) => s.status);
  const profile = useData((s) => s.profile);
  const searchOpen = useUi((s) => s.searchOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4 dark:border-slate-700">
          <img src="./icon-512.png" alt="CLINICAL Rx" className="h-9 w-9 rounded-lg object-cover" />
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

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-300">
            🟢 {status}
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              v{__APP_VERSION__}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <button
              className="btn-ghost !py-1 text-sm"
              onClick={() => setSearchOpen(true)}
              title="Global search (Ctrl/⌘+K)"
            >
              🔍 Search
            </button>
            <div className="text-xs text-slate-400">
              Clinical Day {profile?.clinicalDay ?? 1} · {profile?.site}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
