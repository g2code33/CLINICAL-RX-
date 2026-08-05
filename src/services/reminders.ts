import { useData, uid } from '../stores/data';
import type { Reminder } from '../types';

export function newReminder(input: { title: string; date: string; time: string; note?: string }): Reminder {
  return {
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: input.title,
    date: input.date,
    time: input.time,
    note: input.note,
    done: false,
  };
}

/** Fire a desktop/system notification (Electron bridge or browser Notification). */
export function notify(title: string, body: string): void {
  try {
    // Desktop (Electron): use the main-process notification IPC.
    if (typeof window !== 'undefined' && (window as any).clinicalRx?.notify) {
      (window as any).clinicalRx.notify({ title, body });
      return;
    }
    // Web: browser Notification.
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification(title, { body });
        });
      }
    }
  } catch {
    /* notifications are best-effort */
  }
}

/** Check every minute whether a reminder is due; fire + mark done. */
export function startReminderWatcher(): () => void {
  let lastChecked = Date.now();
  const check = () => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const reminders = useData.getState().reminders ?? [];
    for (const r of reminders) {
      if (r.done) continue;
      if (r.date !== iso || r.time !== hhmm) continue;
      // Fire only once per minute-window.
      const key = `${r.id}:${iso}:${hhmm}`;
      if ((useData as any).__fired?.[key]) continue;
      (useData as any).__fired = { ...((useData as any).__fired || {}), [key]: true };
      notify(`⏰ ${r.title}`, r.note || `Reminder for ${iso} at ${hhmm}`);
      void useData.getState().save('reminder', { ...r, done: true, updatedAt: Date.now() });
    }
    lastChecked = Date.now();
  };
  check();
  const t = setInterval(check, 60000); // every minute
  return () => clearInterval(t);
}

/** Upcoming reminders for a date. */
export function remindersForDate(reminders: Reminder[], date: string): Reminder[] {
  return reminders.filter((r) => r.date === date).sort((a, b) => a.time.localeCompare(b.time));
}
