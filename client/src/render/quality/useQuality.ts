import { create } from "zustand";
import { TIERS, type QualitySettings, type TierName } from "./tiers";

interface QualityStore {
  tier: TierName;
  auto: boolean;
  settings: QualitySettings;
  setTier: (t: TierName) => void;
  setAuto: (v: boolean) => void;
}

/** Single source of truth for render quality. Seeded to Medium (dpr<=1.5, 2048 shadow map) —
 *  a safe default for typical laptop GPUs (e.g. MacBook Air). "high" pushes dpr 2.0 + a 4096
 *  soft shadow map re-rendered every frame, which tanks the framerate on integrated GPUs. The
 *  rendering subsystem wires detect-gpu + <PerformanceMonitor> auto-scaling to pick the tier later. */
export const useQuality = create<QualityStore>((set) => ({
  tier: "medium",
  auto: true,
  settings: TIERS.medium,
  setTier: (tier) => set({ tier, settings: TIERS[tier] }),
  setAuto: (auto) => set({ auto }),
}));
