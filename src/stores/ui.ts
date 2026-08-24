import { create } from 'zustand';

/**
 * Which workspace the app is showing.
 *  - 'clinical' — the day-to-day clinical companion (default, unchanged)
 *  - 'pharmd'   — the longitudinal academic/PharmD journey workspace
 * A single header button switches between them; each mode has its own
 * navigation, drawer and bottom bar.
 */
export type AppMode = 'clinical' | 'pharmd';

const MODE_KEY = 'clinical-rx:app-mode';

function loadMode(): AppMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'pharmd' ? 'pharmd' : 'clinical';
  } catch {
    return 'clinical';
  }
}

function persistMode(mode: AppMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable — mode simply won't persist */
  }
}

interface UiState {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  toggleAppMode: () => AppMode;
}

export const useUi = create<UiState>((set, get) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  appMode: loadMode(),
  setAppMode: (mode) => {
    persistMode(mode);
    set({ appMode: mode });
  },
  /** Flip modes and return the new one (so callers can navigate to its home). */
  toggleAppMode: () => {
    const next: AppMode = get().appMode === 'clinical' ? 'pharmd' : 'clinical';
    persistMode(next);
    set({ appMode: next });
    return next;
  },
}));
