import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { EmptyState, PageHeader } from '../components/ui';
import { MODULE_META, favorites, toggleFavorite } from '../services/learning';

/** ⭐ Favourites — every starred record from across the knowledge base. */
export function Favorites() {
  const navigate = useNavigate();
  const lessons = useData((s) => s.lessons);
  const diseases = useData((s) => s.diseases);
  const medicines = useData((s) => s.medicines);
  const investigations = useData((s) => s.investigations);
  const questions = useData((s) => s.questions);

  const items = useMemo(
    () => favorites(),
    [lessons, diseases, medicines, investigations, questions]
  );

  const grouped = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const i of items) m.set(i.module, [...(m.get(i.module) ?? []), i]);
    return Array.from(m.entries());
  }, [items]);

  return (
    <div>
      <PageHeader title="⭐ Favourites" subtitle="The knowledge you starred, all in one place." />
      {!items.length ? (
        <EmptyState
          icon="⭐"
          title="Nothing starred yet"
          hint="Star a medicine, disease, investigation, note or question and it will appear here for quick access."
        />
      ) : (
        <div className="space-y-5">
          {grouped.map(([module, list]) => (
            <div key={module}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {MODULE_META[module]?.icon} {MODULE_META[module]?.plural} ({list.length})
              </h2>
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => navigate(MODULE_META[f.module]?.route ?? '/')}>
                      <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{f.title}</div>
                      <div className="truncate text-xs text-slate-400">
                        {f.academic || f.subtitle}
                      </div>
                    </button>
                    <button
                      className="shrink-0 text-lg text-amber-500 hover:opacity-70"
                      title="Remove from favourites"
                      onClick={() => toggleFavorite(f.module, f.id)}
                    >
                      ★
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
