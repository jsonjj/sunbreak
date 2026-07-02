// Wanted adapter. Prefers a registered wanted API (the police/wanted subsystem), otherwise
// mirrors the HUD `heat` tier so `setWanted` is visible and `wantedAtLeast` fail states work today.

import { useHudStore } from "@/stores/hud.store";
import type { HeatTier } from "@sunbreak/shared";
import type { WantedCtx } from "../types";
import { clamp } from "../util";

let external: WantedCtx | null = null;

/** The wanted/police subsystem calls this to take over stars read/write. */
export function registerMissionWanted(api: WantedCtx): () => void {
  external = api;
  return () => {
    if (external === api) external = null;
  };
}

export const wantedCtx: WantedCtx = {
  stars: () => (external ? external.stars() : useHudStore.getState().heat),
  set: (stars) => {
    if (external) {
      external.set(stars);
      return;
    }
    useHudStore.getState().patch({ heat: clamp(Math.round(stars), 0, 5) as HeatTier });
  },
};
