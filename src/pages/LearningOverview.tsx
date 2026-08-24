import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { EmptyState, PageHeader, Pill, StatCard } from '../components/ui';
import { QuickAdd } from '../components/QuickAdd';
import { LearningFilterBar } from '../components/LearningFilterBar';
import {
  MODULE_META,
  academicLabel,
  allTags,
  favorites,
  knowledgeByStage,
  learningStats,
  recentActivity,
  recentlyViewed,
  type LearningFilter,
} from '../services/learning';

/**
 * Clinical Learning — the overview dashboard for the knowledge core.
 * Everything here is derived from real stored records; nothing is mocked.
 */
export function LearningOverview() {
  const navigate = useNavigate();
  // Subscribe to every knowledge slice so counts stay live.
  const lessons = useData((s) => s.lessons);
  const diseases = useData((s) => s.diseases);
  const medicines = useData((s) => s.medicines);
  const investigations = useData((s) => s.investigations);
  const questions = useData((s) => s.questions);
  const revisions = useData((s) => s.revisions);
  const activities = useData((s) => s.activities);

  const [filter, setFilter] = useState<LearningFilter>({});
  const [quick, setQuick] = useState(false);

  const deps = [lessons, diseases, medicines, investigations, questions, revisions, filter];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => learningStats(filter), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tags = useMemo(() => allTags().slice(0, 12), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const favs = useMemo(() => favorites().slice(0, 8), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byStage = useMemo(() => knowledgeByStage().filter((r) => r.total > 0), deps);
  const recent = useMemo(() => recentlyViewed(), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activity = useMemo(() => recentActivity(20), [activities]);

  const empty = stats.lessons + stats.diseases + stats.medicines + stats.investigations + stats.questions === 0;

  return (
    <div>
      <PageHeader
        title="📋 Clinical Learning"
        subtitle="Your personal clinical knowledge — captured, connected and kept against the year you learned it."
        action={
          <button className="btn-primary" onClick={() => setQuick(true)}>
            ＋ Quick Add
          </button>
        }
      />

      <LearningFilterBar value={filter} onChange={setFilter} />

      {/* ---- Counts ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard icon="💡" label="Learning Points" value={stats.lessons} to="/notes" />
        <StatCard icon="🦠" label="Diseases" value={stats.diseases} to="/diseases" />
        <StatCard icon="💊" label="Medicines" value={stats.medicines} to="/medicines" />
        <StatCard icon="🧪" label="Investigations" value={stats.investigations} to="/investigations" />
        <StatCard icon="❓" label="Questions" value={stats.questions} to="/questions" />
        <StatCard icon="📚" label="Revision" value={stats.revision} to="/revision" />
      </div>

      {empty ? (
        <div className="mt-5">
          <EmptyState
            icon="📋"
            title="Your clinical knowledge base is empty"
            hint="Capture the first thing you learn — a medicine, a condition, a question. Everything you add is stamped with your current level and stays searchable for the rest of your programme."
            actions={
              <button className="btn-primary" onClick={() => setQuick(true)}>
                ＋ Quick Add
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* ---- Recent activity ---- */}
          <div className="card">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recent activity
            </h2>
            {!activity.length ? (
              <p className="text-sm text-slate-400">Your learning activity will appear here.</p>
            ) : (
              <div className="space-y-3">
                {activity.slice(0, 4).map((g) => (
                  <div key={g.label}>
                    <div className="text-xs font-semibold text-slate-400">{g.label}</div>
                    <ul className="mt-1 space-y-1">
                      {g.entries.slice(0, 5).map((e) => (
                        <li key={e.id} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <span className="mt-0.5 text-xs">{MODULE_META[e.module]?.icon ?? '•'}</span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="capitalize text-slate-400">{e.action}</span> {e.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Attention needed ---- */}
          <div className="space-y-3">
            <button
              className="card flex w-full items-center justify-between text-left transition-colors hover:border-brand-400"
              onClick={() => navigate('/questions')}
            >
              <div>
                <div className="font-semibold">❓ Questions awaiting review</div>
                <div className="text-xs text-slate-400">Unanswered or still being researched</div>
              </div>
              <div className="text-2xl font-bold text-brand-600">{stats.openQuestions}</div>
            </button>
            <button
              className="card flex w-full items-center justify-between text-left transition-colors hover:border-brand-400"
              onClick={() => navigate('/revision')}
            >
              <div>
                <div className="font-semibold">📚 Revision due</div>
                <div className="text-xs text-slate-400">Spaced-repetition queue</div>
              </div>
              <div className="text-2xl font-bold text-brand-600">{stats.dueRevision}</div>
            </button>
            <button
              className="card flex w-full items-center justify-between text-left transition-colors hover:border-brand-400"
              onClick={() => navigate('/favorites')}
            >
              <div>
                <div className="font-semibold">⭐ Favourites</div>
                <div className="text-xs text-slate-400">Knowledge you starred</div>
              </div>
              <div className="text-2xl font-bold text-brand-600">{stats.favorites}</div>
            </button>
          </div>

          {/* ---- Recently viewed ---- */}
          {recent.length > 0 && (
            <div className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recently viewed
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => (
                  <button
                    key={`${r.module}-${r.id}`}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm transition-colors hover:bg-brand-100 dark:bg-slate-700 dark:hover:bg-slate-600"
                    onClick={() => navigate(MODULE_META[r.module]?.route ?? '/')}
                  >
                    {MODULE_META[r.module]?.icon} {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- Favourites ---- */}
          {favs.length > 0 && (
            <div className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                ⭐ Favourites
              </h2>
              <div className="space-y-1.5">
                {favs.map((f) => (
                  <button
                    key={`${f.module}-${f.id}`}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => navigate(MODULE_META[f.module]?.route ?? '/')}
                  >
                    <span>{f.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    {f.academic && <span className="shrink-0 text-[10px] text-slate-400">{f.academic}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- Knowledge growth across years ---- */}
          {byStage.length > 0 && (
            <div className="card lg:col-span-2">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Knowledge growth
              </h2>
              <p className="mb-3 text-xs text-slate-400">
                Real counts of what you recorded in each academic stage — no invented scores.
              </p>
              <div className="space-y-2">
                {byStage.map((row) => {
                  const max = Math.max(...byStage.map((r) => r.total), 1);
                  return (
                    <div key={row.stageId}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600 dark:text-slate-300">{row.label}</span>
                        <span className="text-slate-400">{row.total} records</span>
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <div className="bg-brand-500 transition-all" style={{ width: `${(row.total / max) * 100}%` }} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                        {Object.entries(row.counts)
                          .filter(([, n]) => n > 0)
                          .map(([m, n]) => (
                            <span key={m}>
                              {MODULE_META[m]?.icon} {n}
                            </span>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---- Tags ---- */}
          {tags.length > 0 && (
            <div className="card lg:col-span-2">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      filter.tag === t.tag
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                    onClick={() => setFilter((f) => ({ ...f, tag: f.tag === t.tag ? undefined : t.tag }))}
                  >
                    #{t.tag} <span className="opacity-60">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

/** Small helper used by the knowledge pages to show a record's academic stamp. */
export function AcademicStamp({ record }: { record: { academic?: any } }) {
  const label = academicLabel(record);
  if (!label) return null;
  return <Pill color="slate">{label}</Pill>;
}
