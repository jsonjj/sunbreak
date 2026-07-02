import { create } from "zustand";

/** Small reactive slice for UI (e.g. the click-to-play prompt). Per-frame input values live
 *  on the InputManager singleton, NOT here. */
interface InputStore {
  locked: boolean;
  setLocked: (v: boolean) => void;
}

export const useInputStore = create<InputStore>((set) => ({
  locked: false,
  setLocked: (locked) => set({ locked }),
}));
