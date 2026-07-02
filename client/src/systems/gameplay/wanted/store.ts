// HUD-facing wanted state (zustand). Systems mutate it via actions; React HUD components read
// it with selectors. The authoritative star math lives here so both the sim and any UI agree.
// The current star level is ALSO mirrored into the shared central HUD store (`heat`) and onto
// the player ECS entity (`wanted_stars`) by `hudMirrorSystem` — this store carries the richer
// state (searching / last-known-position / suspect profile) the police HUD wants.
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { SuspectProfile } from "./types";
import { MAX_STARS, heatFloorForStars, starForHeat } from "./tuning";

export interface WantedStoreState {
  /** 0..5 star level shown on the HUD. */
  stars: number;
  /** Raw heat points behind the stars. */
  heat: number;
  /** True while cooling down (no unit holds line-of-sight) — HUD blinks the stars. */
  searching: boolean;
  /** Last-known-position of the suspect (search seed), or null when clean. */
  lkp: { x: number; z: number } | null;
  /** The description the police are hunting (v3 disguise "outs" degrade this). */
  suspectProfile: SuspectProfile | null;
  /** Count of deployed police units (HUD/debug). */
  activeUnits: number;

  /** Add heat for a witnessed crime and floor the star level to `minStars`. */
  addHeat: (delta: number, minStars: number) => void;
  /** Hard-set the star level (e.g. mission wanted-override). */
  setStars: (stars: number) => void;
  /** Drop one star (cooldown expiry); clears everything at 0. */
  decayStar: () => void;
  setSearching: (searching: boolean) => void;
  setLkp: (lkp: { x: number; z: number } | null) => void;
  setSuspectProfile: (p: SuspectProfile | null) => void;
  setActiveUnits: (n: number) => void;
  /** Full reset (arrest, death, safehouse). */
  clear: () => void;
}

const clampStars = (s: number): number => Math.max(0, Math.min(MAX_STARS, Math.round(s)));

export const useWantedStore = create<WantedStoreState>()(
  subscribeWithSelector((set) => ({
    stars: 0,
    heat: 0,
    searching: false,
    lkp: null,
    suspectProfile: null,
    activeUnits: 0,

    addHeat: (delta, minStars) =>
      set((s) => {
        let heat = Math.max(0, s.heat + delta);
        if (minStars > 0) heat = Math.max(heat, heatFloorForStars(minStars));
        const stars = clampStars(Math.max(starForHeat(heat), minStars, s.stars));
        return { heat, stars, searching: false };
      }),

    setStars: (stars) => {
      const s = clampStars(stars);
      set({ stars: s, heat: heatFloorForStars(s), searching: false });
    },

    decayStar: () =>
      set((s) => {
        const stars = clampStars(s.stars - 1);
        if (stars === 0) {
          return {
            stars: 0,
            heat: 0,
            searching: false,
            lkp: null,
            suspectProfile: null,
          };
        }
        return { stars, heat: heatFloorForStars(stars) };
      }),

    setSearching: (searching) => set({ searching }),
    setLkp: (lkp) => set({ lkp }),
    setSuspectProfile: (suspectProfile) => set({ suspectProfile }),
    setActiveUnits: (activeUnits) => set({ activeUnits }),

    clear: () =>
      set({
        stars: 0,
        heat: 0,
        searching: false,
        lkp: null,
        suspectProfile: null,
      }),
  })),
);

/** Convenience read for other subsystems (Missions pursuit-pressure, HUD, etc.). */
export const getWantedLevel = (): number => useWantedStore.getState().stars;

/** True when the player is being actively hunted (stars > 0). */
export const isWanted = (): boolean => useWantedStore.getState().stars > 0;
