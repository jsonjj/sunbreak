// Tier presets + a frame-time governor. The governor sheds AMBIENT cost first (rain density,
// dust, ambient emitters) when the frame budget slips, before ever touching gameplay-critical
// flashes/impacts. Hard caps below keep total live particles inside the per-tier ceiling.
import type { TierCaps, VfxTier } from "../types";

// Targets (from vfx.md): Low ≤2k live / ~64 decals / 0 FX lights; Med ≤6k / 128 / 2;
// High ≤12k / 256 / 4. Rain is counted separately (its own instanced draw).
export const TIER_CAPS: Record<VfxTier, TierCaps> = {
  LOW: {
    maxAdditive: 512,
    maxSmoke: 384,
    maxSparks: 640,
    maxRain: 0,
    maxDecals: 64,
    maxLights: 0,
    maxHero: 0,
    softParticles: false,
  },
  MED: {
    maxAdditive: 1536,
    maxSmoke: 1024,
    maxSparks: 1792,
    maxRain: 1600,
    maxDecals: 128,
    maxLights: 2,
    maxHero: 2,
    softParticles: false,
  },
  HIGH: {
    maxAdditive: 3072,
    maxSmoke: 2048,
    maxSparks: 3584,
    maxRain: 3500,
    maxDecals: 256,
    maxLights: 4,
    maxHero: 4,
    softParticles: true,
  },
};

/** Map the global quality store's tier name onto a VFX tier. */
export function tierFromQuality(name: "low" | "medium" | "high"): VfxTier {
  return name === "low" ? "LOW" : name === "high" ? "HIGH" : "MED";
}

/** Smooth frame-time governor. `quality` ∈ [0,1]: 1 = healthy (~55fps+), 0 = struggling
 *  (~30fps). Ambient systems multiply their target counts by this value. */
export class Governor {
  private emaDt = 1 / 60;
  quality = 1;

  /** Feed the frame delta (seconds). Call once per frame BEFORE spawning ambient FX. */
  sample(dt: number): number {
    const clamped = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    // Heavier weight on history keeps the governor from thrashing on single spikes.
    this.emaDt = this.emaDt * 0.9 + clamped * 0.1;
    // Healthy at/under ~18ms; fully regressed at/over ~33ms.
    const t = (this.emaDt - 0.018) / (0.033 - 0.018);
    this.quality = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t;
    return this.quality;
  }

  get fps(): number {
    return this.emaDt > 0 ? 1 / this.emaDt : 0;
  }
}
