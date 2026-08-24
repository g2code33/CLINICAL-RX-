import { useMemo } from 'react';
import { useData } from '../stores/data';
import { allStages, periodsFor } from '../services/academic';
import type { LearningFilter } from '../services/learning';

/**
 * Academic filter bar shared by the clinical-learning pages.
 * Lets the user slice their knowledge by level, academic year, semester,
 * course or favourites — including years they've already completed.
 */
export function LearningFilterBar({
  value,
  onChange,
  compact,
}: {
  value: LearningFilter;
  onChange: (f: LearningFilter) => void;
  compact?: boolean;
}) {
  const stages = useData((s) => s.academicStages);
  const courses = useData((s) => s.courses);
  const ordered = useMemo(() => allStages(), [stages]);
  const periods = value.stageId ? periodsFor(value.stageId) : [];
  const stageCourses = value.stageId ? courses.filter((c) => c.stageId === value.stageId) : courses;

  const active = !!(value.stageId || value.periodId || value.courseId || value.tag || value.favorite || value.query);

  function set(patch: Partial<LearningFilter>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact && (
        <input
          className="input !w-auto min-w-[180px] flex-1 !py-1.5 text-sm"
          placeholder="Filter by text…"
          value={value.query ?? ''}
          onChange={(e) => set({ query: e.target.value || undefined })}
        />
      )}

      <select
        className="input !w-auto !py-1.5 text-sm"
        value={value.stageId ?? ''}
        onChange={(e) => set({ stageId: e.target.value || undefined, periodId: undefined })}
        aria-label="Filter by academic stage"
      >
        <option value="">All levels</option>
        {ordered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.academicYear}
          </option>
        ))}
      </select>

      {periods.length > 0 && (
        <select
          className="input !w-auto !py-1.5 text-sm"
          value={value.periodId ?? ''}
          onChange={(e) => set({ periodId: e.target.value || undefined })}
          aria-label="Filter by semester"
        >
          <option value="">All semesters</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {stageCourses.length > 0 && (
        <select
          className="input !w-auto !py-1.5 text-sm"
          value={value.courseId ?? ''}
          onChange={(e) => set({ courseId: e.target.value || undefined })}
          aria-label="Filter by course"
        >
          <option value="">All courses</option>
          {stageCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}

      <button
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          value.favorite
            ? 'bg-amber-500 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
        }`}
        onClick={() => set({ favorite: value.favorite ? undefined : true })}
      >
        ⭐ Favourites
      </button>

      {value.tag && (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
          #{value.tag}
          <button className="hover:text-red-500" onClick={() => set({ tag: undefined })}>
            ×
          </button>
        </span>
      )}

      {active && (
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onChange({})}>
          Clear filters
        </button>
      )}
    </div>
  );
}
