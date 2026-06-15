import { create } from 'zustand';

interface UiStore {
  isCartDrawerOpen: boolean;
  isMobileNavOpen: boolean;
  isSearchOpen: boolean;
  hasIntroPlayed: boolean;
  setCartDrawerOpen: (isOpen: boolean) => void;
  toggleCartDrawer: () => void;
  setMobileNavOpen: (isOpen: boolean) => void;
  toggleMobileNav: () => void;
  setSearchOpen: (isOpen: boolean) => void;
  toggleSearch: () => void;
  setIntroPlayed: (played: boolean) => void;
  closeAll: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isCartDrawerOpen: false,
  isMobileNavOpen: false,
  isSearchOpen: false,
  hasIntroPlayed: false,

  setCartDrawerOpen: (isOpen) => set({ isCartDrawerOpen: isOpen }),
  toggleCartDrawer: () => set((state) => ({ isCartDrawerOpen: !state.isCartDrawerOpen })),

  setMobileNavOpen: (isOpen) => set({ isMobileNavOpen: isOpen }),
  toggleMobileNav: () => set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),

  setSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

  setIntroPlayed: (played) => set({ hasIntroPlayed: played }),

  closeAll: () =>
    set({
      isCartDrawerOpen: false,
      isMobileNavOpen: false,
      isSearchOpen: false,
    }),
}));
