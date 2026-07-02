// The mixer: master + per-category volumes, mute/solo, and a runtime "duck" multiplier.
// Persisted to localStorage so player volume choices survive reloads. `effVol()` is the single
// source of truth every voice/stream uses to compute its final gain.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CATEGORIES,
  DEFAULT_CATEGORY_VOLUME,
  DEFAULT_MASTER_VOLUME,
  type Category,
  type MixChannel,
} from "./categories";
import { clamp01 } from "../AudioEngine";

export interface MixerState {
  master: number;
  categories: Record<Category, number>;
  muted: Partial<Record<Category, boolean>>;
  /** When set, only this category is audible (monitoring/solo). */
  solo: Category | null;
  /** Runtime ducking multipliers (0..1), NOT persisted. Managed by `ducking.ts`. */
  duck: Partial<Record<Category, number>>;

  setMaster: (v: number) => void;
  setCategoryVolume: (c: Category, v: number) => void;
  setMute: (c: Category, muted: boolean) => void;
  toggleMute: (c: Category) => void;
  setSolo: (c: Category | null) => void;
  setDuck: (c: Category, multiplier: number) => void;
  clearDuck: (c: Category) => void;

  /** Final gain for a channel: master * category * duck (0 if muted / solo-excluded). */
  effVol: (channel: MixChannel, base?: number) => number;
}

const cloneDefaults = (): Record<Category, number> => ({ ...DEFAULT_CATEGORY_VOLUME });

export const useMixer = create<MixerState>()(
  persist(
    (set, get) => ({
      master: DEFAULT_MASTER_VOLUME,
      categories: cloneDefaults(),
      muted: {},
      solo: null,
      duck: {},

      setMaster: (v) => set({ master: clamp01(v) }),
      setCategoryVolume: (c, v) =>
        set((s) => ({ categories: { ...s.categories, [c]: clamp01(v) } })),
      setMute: (c, muted) => set((s) => ({ muted: { ...s.muted, [c]: muted } })),
      toggleMute: (c) => set((s) => ({ muted: { ...s.muted, [c]: !s.muted[c] } })),
      setSolo: (c) => set({ solo: c }),
      setDuck: (c, multiplier) => set((s) => ({ duck: { ...s.duck, [c]: clamp01(multiplier) } })),
      clearDuck: (c) =>
        set((s) => {
          if (s.duck[c] === undefined) return s;
          const next = { ...s.duck };
          delete next[c];
          return { duck: next };
        }),

      effVol: (channel, base = 1) => {
        const s = get();
        if (channel === "master") return clamp01(s.master) * base;
        if (s.solo && s.solo !== channel) return 0;
        if (s.muted[channel]) return 0;
        const cat = s.categories[channel] ?? 1;
        const duck = s.duck[channel] ?? 1;
        return clamp01(s.master) * clamp01(cat) * duck * base;
      },
    }),
    {
      name: "sunbreak.audio.mix",
      version: 1,
      // Never persist the runtime duck multipliers.
      partialize: (s) => ({
        master: s.master,
        categories: s.categories,
        muted: s.muted,
        solo: s.solo,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MixerState>;
        // Guard against a stale persisted shape missing newly-added categories.
        const categories = { ...current.categories, ...(p.categories ?? {}) };
        for (const c of CATEGORIES) if (typeof categories[c] !== "number") categories[c] = DEFAULT_CATEGORY_VOLUME[c];
        return { ...current, ...p, categories, duck: {} };
      },
    },
  ),
);

/** Effective volume without a React subscription (for imperative voice code). */
export const effVol = (channel: MixChannel, base = 1): number => useMixer.getState().effVol(channel, base);
