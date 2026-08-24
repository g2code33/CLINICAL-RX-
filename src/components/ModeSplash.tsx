import { useEffect, useState } from 'react';
import type { AppMode } from '../stores/ui';

/**
 * Brief full-screen splash shown while the app switches workspaces.
 * Purely presentational: it covers the moment the whole shell (sidebar,
 * drawer, bottom nav, page) swaps so the transition reads as deliberate
 * rather than as a flicker.
 */
export function ModeSplash({ mode, onDone }: { mode: AppMode; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const isPharmd = mode === 'pharmd';

  useEffect(() => {
    // Fade out shortly before unmounting so the exit is smooth.
    const fade = setTimeout(() => setLeaving(true), 620);
    const done = setTimeout(onDone, 900);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center transition-opacity duration-300 ${
        leaving ? 'opacity-0' : 'opacity-100'
      } ${isPharmd ? 'bg-indigo-950' : 'bg-brand-950'}`}
      role="status"
      aria-live="polite"
    >
      <img
        src="./v2.PNG"
        alt="CLINICAL Rx"
        className="h-24 w-24 animate-[splashPop_500ms_cubic-bezier(0.34,1.56,0.64,1)] rounded-3xl object-cover shadow-2xl"
      />
      <div className="mt-4 text-lg font-extrabold tracking-tight text-white">CLINICAL Rx</div>
      <div className={`mt-1 text-sm font-medium ${isPharmd ? 'text-indigo-300' : 'text-brand-300'}`}>
        {isPharmd ? '🎓 PharmD Journey' : '🩺 Clinical Companion'}
      </div>
      <div className="mt-5 h-0.5 w-28 overflow-hidden rounded-full bg-white/20">
        <div className="h-full w-full origin-left animate-[splashBar_800ms_ease-out] bg-white/70" />
      </div>
    </div>
  );
}
