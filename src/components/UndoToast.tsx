import { useEffect, useState } from 'react';
import { useData } from '../stores/data';

// Bottom toast: appears after a delete, offers Undo. Disappears after 6s.
export function UndoToast() {
  const removed = useData((s) => s.removed);
  const undoRemoved = useData((s) => s.undoRemoved);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (removed.length === 0) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [removed.length]);

  if (!visible || removed.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-50 flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 lg:bottom-6">
      <span className="text-slate-600 dark:text-slate-200">🗑 Deleted</span>
      <button
        className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
        onClick={() => { void undoRemoved(); setVisible(false); }}
      >
        ↩ Undo
      </button>
    </div>
  );
}
