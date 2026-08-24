import { Modal } from './Modal';
import { useUi } from '../stores/ui';

const NAV_SHORTCUTS: Array<[string, string]> = [
  ['h', 'Home'],
  ['d', 'Clinical Days'],
  ['c', 'Calendar'],
  ['m', 'Medicines'],
  ['q', 'Questions'],
  ['r', 'Revision'],
  ['b', 'Bundles'],
  ['p', 'Progress'],
  ['a', 'AI'],
  ['s', 'Settings'],
];

export function ShortcutHelp() {
  const open = useUi((s) => s.helpOpen);
  const setOpen = useUi((s) => s.setHelpOpen);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="⌨️ Keyboard shortcuts">
      <div className="space-y-4 text-sm">
        <div>
          <div className="label mb-2">Global</div>
          <ShortcutRow keys={['Ctrl/⌘+K']} desc="Command bar — navigate, search records, ask AI" />
          <ShortcutRow keys={['Ctrl/⌘+Shift+F']} desc="Global search" />
          <ShortcutRow keys={['Ctrl/⌘+N']} desc="Quick capture (today's log)" />
          <ShortcutRow keys={['Ctrl/⌘+,']} desc="Settings" />
          <ShortcutRow keys={['?']} desc="Show this help" />
        </div>
        <div>
          <div className="label mb-2">Go to… (press <code>g</code> then a key)</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {NAV_SHORTCUTS.map(([k, label]) => (
              <ShortcutRow key={k} keys={['g', k]} desc={label} />
            ))}
          </div>
        </div>
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
          Shortcuts are ignored while you're typing (except <code>Ctrl/⌘</code> combos).
        </p>
      </div>
    </Modal>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <span className="text-slate-600 dark:text-slate-300">{desc}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-400">then</span>}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {k}
            </kbd>
          </span>
        ))}
      </span>
    </div>
  );
}
