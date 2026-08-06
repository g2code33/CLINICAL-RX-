import { useTasks } from '../stores/tasks';
import { useShallow } from 'zustand/react/shallow';

/**
 * Floating Arena-style activity indicator. Shows whatever the AI is doing
 * right now (across ALL AI sections / pages), with live streamed text.
 * Mounted once in the Layout, so it's visible from anywhere in the app.
 */
export function TaskIndicator() {
  // IMPORTANT: select the raw array and filter AFTER (or use useShallow) —
  // selecting s.tasks.filter(...) creates a new array every render, which
  // makes zustand re-render forever (React error #185, blank black screen).
  const tasks = useTasks(useShallow((s) => s.tasks.filter((t) => t.status === 'running')));

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-3 z-40 w-72 max-w-[92vw] space-y-2 lg:bottom-4">
      {tasks.map((t) => (
        <div key={t.id} className="rounded-xl border border-brand-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-brand-800 dark:bg-slate-800/95">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            {t.label}
          </div>
          {t.streamText ? (
            <p className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
              {t.streamText.slice(-160)}
            </p>
          ) : (
            <div className="mt-2 space-y-1">
              {['Reading your request', 'Loading your clinical data', 'Thinking through the best answer…'].map((s, i) => (
                <div key={s} className={`flex items-center gap-1.5 text-[11px] ${i === 2 ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}`}>
                  {i < 2 ? <span className="text-green-600">✓</span> : <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />}
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
