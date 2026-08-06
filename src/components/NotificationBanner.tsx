import { useNotifs } from '../stores/notifications';

/**
 * Global broadcast banner — shows reminders (and any app notification) on
 * ANY page, with a sound toggle. Auto-dismisses after 8s; a small history
 * stack appears bottom-left (above the task indicator) on desktop, top on
 * mobile-safe placement.
 */
export function NotificationBanner() {
  const notifications = useNotifs((s) => s.notifications.slice(0, 3));
  const dismiss = useNotifs((s) => s.dismiss);
  const soundOn = useNotifs((s) => s.soundOn);
  const setSound = useNotifs((s) => s.setSound);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed left-3 top-16 z-50 w-80 max-w-[92vw] space-y-2">
      <div className="flex items-center justify-end gap-2">
        <button
          className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-slate-600 shadow dark:bg-slate-700/80 dark:text-slate-200"
          onClick={() => setSound(!soundOn)}
          title={soundOn ? 'Mute reminder sound' : 'Enable reminder sound'}
        >
          {soundOn ? '🔔 Sound on' : '🔕 Sound off'}
        </button>
      </div>
      {notifications.map((n) => (
        <div key={n.id} className="rounded-xl border border-brand-300 bg-white p-3 shadow-2xl dark:border-brand-700 dark:bg-slate-800">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-bold text-brand-700 dark:text-brand-300">{n.title}</div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => dismiss(n.id)}>✕</button>
          </div>
          <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-200">{n.body}</div>
          <div className="mt-1 text-[10px] text-slate-400">{new Date(n.ts).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  );
}
