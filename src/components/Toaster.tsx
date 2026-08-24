import { useEffect, useState } from 'react';
import { create } from 'zustand';

/**
 * 🔔 UNIFIED TOAST SYSTEM (Phase 9 §33)
 *
 * Before this, feedback was scattered: some pages set a status string, some
 * rendered their own inline message, some used `alert()`. This is the one
 * place transient feedback lives.
 *
 * Toasts are announced politely to screen readers, never block the UI, and
 * carry an optional action. Errors persist until dismissed, because a message
 * the user needs to act on should not disappear on a timer.
 */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional single action, e.g. "Retry" or "Undo". */
  action?: { label: string; run: () => void };
  /** ms before auto-dismiss. Errors default to sticky. */
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative helpers so services (not just components) can report outcomes. */
export const toast = {
  success: (message: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'success', message, action }),
  error: (message: string, action?: Toast['action']) =>
    useToasts.getState().push({ tone: 'error', message, action, duration: 0 }),
  info: (message: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'info', message, action }),
  warning: (message: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'warning', message, action }),
};

const TONE: Record<ToastTone, { icon: string; cls: string; label: string }> = {
  // Icon + word, so status never depends on colour alone (§27).
  success: { icon: '✓', label: 'Success', cls: 'border-emerald-400/50 bg-emerald-50 dark:bg-emerald-900/40' },
  error: { icon: '⚠', label: 'Error', cls: 'border-red-400/50 bg-red-50 dark:bg-red-900/40' },
  warning: { icon: '!', label: 'Warning', cls: 'border-amber-400/50 bg-amber-50 dark:bg-amber-900/40' },
  info: { icon: 'i', label: 'Info', cls: 'border-sky-400/50 bg-sky-50 dark:bg-sky-900/40' },
};

function ToastRow({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const meta = TONE[t.tone];
  const duration = t.duration ?? (t.tone === 'error' ? 0 : 4500);

  useEffect(() => {
    if (!duration) return; // 0 = sticky
    const timer = setTimeout(() => dismiss(t.id), duration);
    return () => clearTimeout(timer);
  }, [t.id, duration, dismiss]);

  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm shadow-lg backdrop-blur ${meta.cls}`}>
      <span className="mt-0.5 font-bold" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="sr-only">{meta.label}:</span>
      <span className="min-w-0 flex-1 break-anywhere">{t.message}</span>
      {t.action && (
        <button
          className="shrink-0 font-medium underline focus-ring"
          onClick={() => {
            t.action?.run();
            dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button className="shrink-0 opacity-60 hover:opacity-100 focus-ring" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div
      className="toast-region pointer-events-none fixed bottom-20 right-3 z-[60] space-y-2 sm:bottom-4"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastRow t={t} />
        </div>
      ))}
    </div>
  );
}

/**
 * 📴 CONNECTION INDICATOR (Phase 9 §32)
 *
 * Reassurance, not alarm: the message always tells the user their data is
 * safe. Only appears when offline, so it never adds noise in the normal case.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed bottom-20 left-3 z-[55] flex items-center gap-2 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur dark:border-slate-600 dark:bg-slate-800/95 sm:bottom-4"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">📴</span>
      <span>
        <strong>Offline</strong> — your data is still here and changes are saved.
      </span>
    </div>
  );
}
