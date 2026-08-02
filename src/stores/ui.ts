import { create } from 'zustand';

interface UiState {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),
}));
