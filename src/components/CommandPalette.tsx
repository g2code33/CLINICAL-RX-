import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { useUi } from '../stores/ui';

interface Command {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const s = useData.getState();
    const go = (r: string) => () => { setOpen(false); navigate(r); };
    const base: Command[] = [
      { id: 'home', icon: '🏠', label: 'Go to Home', run: go('/') },
      { id: 'days', icon: '📋', label: 'Clinical Days', run: go('/clinical') },
      { id: 'calendar', icon: '📅', label: 'Calendar', run: go('/calendar') },
      { id: 'diseases', icon: '🦠', label: 'Diseases', run: go('/diseases') },
      { id: 'medicines', icon: '💊', label: 'Medicines', run: go('/medicines') },
      { id: 'investigations', icon: '🧪', label: 'Investigations', run: go('/investigations') },
      { id: 'questions', icon: '❓', label: 'Questions', run: go('/questions') },
      { id: 'revision', icon: '📚', label: 'Revision', run: go('/revision') },
      { id: 'bundles', icon: '📦', label: 'Bundles', run: go('/bundles') },
      { id: 'progress', icon: '📊', label: 'Progress', run: go('/progress') },
      { id: 'ai', icon: '🤖', label: 'AI Chat', run: go('/ai') },
      { id: 'settings', icon: '⚙️', label: 'Settings', run: go('/settings') },
      { id: 'search', icon: '🔍', label: 'Open global search', run: () => { setOpen(false); setSearchOpen(true); } },
      { id: 'newday', icon: '＋', label: 'New clinical day', run: () => { setOpen(false); navigate('/clinical'); } },
      { id: 'quickadd', icon: '⚡', label: 'Quick capture (open AI)', run: () => { setOpen(false); navigate('/ai'); } },
      { id: 'autodaily', icon: '🤖', label: 'Generate auto daily bundle', hint: 'Bundle Library', run: () => { setOpen(false); navigate('/bundles'); } },
    ];
    const dynamic: Command[] = [];
    for (const d of s.diseases.slice(0, 5)) dynamic.push({ id: 'd-' + d.id, icon: '🦠', label: 'Disease: ' + d.name, hint: 'Open', run: () => { setOpen(false); navigate('/diseases'); } });
    for (const m of s.medicines.slice(0, 5)) dynamic.push({ id: 'm-' + m.id, icon: '💊', label: 'Medicine: ' + m.name, hint: 'Open', run: () => { setOpen(false); navigate('/medicines'); } });
    return [...base, ...dynamic];
  }, [navigate, setOpen, setSearchOpen]);

  const filtered = commands.filter((c) => {
    if (!q.trim()) return true;
    return c.label.toLowerCase().includes(q.toLowerCase()) || (c.hint ?? '').toLowerCase().includes(q.toLowerCase());
  });

  useEffect(() => {
    setSel(0);
  }, [q]);

  if (!open) return null;

  const pick = (c: Command) => c.run();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className="text-slate-400">⌘</span>
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Type a command or search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter' && filtered[sel]) pick(filtered[sel]);
              else if (e.key === 'Escape') setOpen(false);
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">No commands found.</p>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === sel ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(c)}
              >
                <span>{c.icon}</span>
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="text-xs opacity-60">{c.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
