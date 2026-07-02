export type TierName = "low" | "medium" | "high";

export interface QualitySettings {
  dprMax: number;
  shadows: false | "pcf" | "soft";
  shadowMap: 1024 | 2048 | 4096;
  ao: boolean;
  bloom: boolean;
  fogDensity: number;
}

export const TIERS: Record<TierName, QualitySettings> = {
  low: { dprMax: 1.0, shadows: false, shadowMap: 1024, ao: false, bloom: false, fogDensity: 0.02 },
  medium: {
    dprMax: 1.5,
    shadows: "pcf",
    shadowMap: 2048,
    ao: true,
    bloom: true,
    fogDensity: 0.012,
  },
  high: { dprMax: 2.0, shadows: "soft", shadowMap: 4096, ao: true, bloom: true, fogDensity: 0.008 },
};
