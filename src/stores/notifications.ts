import { create } from 'zustand';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  ts: number;
}

interface NotifState {
  notifications: AppNotification[]; // recent broadcasts (kept for history)
  soundOn: boolean;
  push: (title: string, body: string) => void;
  dismiss: (id: string) => void;
  setSound: (on: boolean) => void;
}

// Global in-app broadcast store: reminders (and anything else) can push a
// banner that appears on ANY page, not just the calendar.
export const useNotifs = create<NotifState>((set) => ({
  notifications: [],
  soundOn: true,
  push: (title, body) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ notifications: [{ id, title, body, ts: Date.now() }, ...s.notifications].slice(0, 20) }));
    // Play a sound to create awareness (if enabled).
    if (useNotifs.getState().soundOn) {
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.6);
        }
      } catch { /* audio optional */ }
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  setSound: (on) => set({ soundOn: on }),
}));
