import { create } from "zustand";
import { TIERS, type QualitySettings, type TierName } from "./tiers";

interface QualityStore {
  tier: TierName;
  auto: boolean;
  settings: QualitySettings;
  setTier: (t: TierName) => void;
  setAuto: (v: boolean) => void;
}

/** Single source of truth for render quality. Seeded to High; the rendering subsystem wires
 *  detect-gpu + <PerformanceMonitor> auto-scaling later. */
export const useQuality = create<QualityStore>((set) => ({
  tier: "high",
  auto: true,
  settings: TIERS.high,
  setTier: (tier) => set({ tier, settings: TIERS[tier] }),
  setAuto: (auto) => set({ auto }),
}));
