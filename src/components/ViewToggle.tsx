/** Cards / List view toggle — reused across pages so every list suits both
 *  visual and compact users. */
export function ViewToggle({ view, onChange }: { view: 'cards' | 'list'; onChange: (v: 'cards' | 'list') => void }) {
  return (
    <div className="flex gap-1.5">
      <button
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === 'cards' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
        onClick={() => onChange('cards')}
        title="Card view"
      >
        🃏 Cards
      </button>
      <button
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
        onClick={() => onChange('list')}
        title="List view"
      >
        📋 List
      </button>
    </div>
  );
}
