import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { HudStoreState } from "@sunbreak/shared";

interface HudStore extends HudStoreState {
  /** Written ONLY by the HUD bridge (throttled + quantized). */
  patch: (p: Partial<HudStoreState>) => void;
}

export const useHudStore = create<HudStore>()(
  subscribeWithSelector((set) => ({
    health: 100,
    armor: 0,
    stamina: 100,
    heat: 0,
    cash: 0,
    bank: 0,
    ability: 0,
    speedKmh: 0,
    weapon: null,
    ammoClip: 0,
    ammoReserve: 0,
    inVehicle: false,
    blips: [],
    patch: (p) => set(p),
  })),
);
