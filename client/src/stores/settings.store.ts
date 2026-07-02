import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type SettingsState } from "@sunbreak/shared";

interface SettingsStore extends SettingsState {
  setQuality: (q: SettingsState["graphics"]["quality"]) => void;
  setMouseSensitivity: (n: number) => void;
  setInvertY: (v: boolean) => void;
  reset: () => void;
}

/** The ONLY persisted store (localStorage), versioned + migratable. */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setQuality: (quality) => set((s) => ({ graphics: { ...s.graphics, quality } })),
      setMouseSensitivity: (mouseSensitivity) =>
        set((s) => ({ controls: { ...s.controls, mouseSensitivity } })),
      setInvertY: (invertY) => set((s) => ({ controls: { ...s.controls, invertY } })),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "sunbreak:settings",
      storage: createJSONStorage(() => localStorage),
      version: SETTINGS_VERSION,
      partialize: ({ audio, graphics, controls, accessibility }) => ({
        audio,
        graphics,
        controls,
        accessibility,
      }),
      migrate: (persisted, from) => {
        let s = persisted as SettingsState;
        if (from < 1) s = { ...DEFAULT_SETTINGS, ...s };
        return s;
      },
    },
  ),
);
