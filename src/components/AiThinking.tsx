import { useEffect, useState } from 'react';
import { useData } from '../stores/data';

/**
 * Arena-style live activity indicator: shows the user, step by step, what the
 * AI is doing while they wait — completed steps get a ✓, the current step
 * pulses, and a progress bar fills. Keeps users engaged instead of a plain
 * "thinking…" spinner.
 */
export function AiThinking({ moduleLabel, detail, live }: { moduleLabel: string; detail?: string; live?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const s = useData.getState();
  const dataLine = `${s.days.length} days · ${s.diseases.length} conditions · ${s.medicines.length} medicines · ${s.investigations.length} investigations · ${s.questions.length} questions`;

  const steps = [
    { at: 0, label: `Reading your request for ${moduleLabel}` },
    { at: 0, label: `Loading your clinical data (${dataLine})` },
    { at: 1, label: 'Reviewing your saved chats & learning history' },
    { at: 2, label: 'Applying your preferred explanation style' },
    { at: 3, label: 'Thinking through the best answer…' },
    { at: 5, label: 'Drafting a thorough, well-structured response…' },
    { at: 8, label: 'Still working — great answers take a little time…' },
  ];

  const doneCount = Math.min(steps.filter((st) => elapsed >= st.at + 1).length, steps.length - 1);
  const progress = Math.min(100, Math.round((doneCount / (steps.length - 1)) * 100));

  return (
    <div className="w-full rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-900/20">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        {moduleLabel} is working
      </div>
      {detail ? (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      ) : null}
      {live ? (
        <div className="mb-2 max-h-32 overflow-y-auto rounded-lg bg-white/70 p-2.5 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          <span className="mr-1 font-semibold text-brand-600 dark:text-brand-300">Live preview:</span>
          {live}
          <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-brand-400 align-middle" />
        </div>
      ) : null}
      <div className="space-y-1">
        {steps.map((st, i) => {
          const done = elapsed >= st.at + 1;
          const active = !done && elapsed >= st.at && i <= doneCount + 1;
          if (elapsed < st.at) return null;
          return (
            <div key={i} className={`flex items-center gap-2 text-xs ${done ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>
              {done ? (
                <span className="text-green-600">✓</span>
              ) : active ? (
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-500" />
              ) : (
                <span className="inline-block h-3 w-3 rounded-full border border-slate-300" />
              )}
              {st.label}
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1.5 text-right text-[10px] text-slate-400">{progress}%</div>
    </div>
  );
}
