import { create } from "zustand";
import type { PauseTab, Toast, UiStoreState } from "@sunbreak/shared";

interface UiStore extends UiStoreState {
  setActiveMenu: (menu: string | null) => void;
  setPauseTab: (tab: PauseTab) => void;
  pushToast: (toast: Toast) => void;
  dismissToast: (id: string) => void;
  setContextPrompt: (prompt: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeMenu: null,
  pauseTab: "map",
  weaponWheelOpen: false,
  interactionMenuOpen: false,
  mapOpen: false,
  phone: { open: false, app: null },
  toasts: [],
  contextPrompt: null,
  setActiveMenu: (activeMenu) => set({ activeMenu }),
  setPauseTab: (pauseTab) => set({ pauseTab }),
  pushToast: (toast) => set((s) => ({ toasts: [...s.toasts, toast] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setContextPrompt: (contextPrompt) => set({ contextPrompt }),
}));
