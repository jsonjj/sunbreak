// Data-driven effect presets. Emitters read these so tuning lives in one place and effects
// stay consistent. Colors are 0xRRGGBB and used directly (unpacked to 0..1) against the
// tone-mapping-disabled VFX materials, so hex ≈ what you see.
import type { VfxSurface } from "./types";

export interface ImpactPreset {
  /** Additive point sparks (hot). */
  sparks: number;
  /** Alpha smoke/dust puffs. */
  puffs: number;
  /** Small ballistic point debris. */
  debris: number;
  sparkColor: number;
  puffColor: number;
  puffSize: number;
  /** Lay a scorch/mark decal on the ground/surface. */
  decal: boolean;
  decalColor: number;
  /** Water-style upward splash instead of a puff. */
  splash: boolean;
  /** Blood mist tint (flesh). */
  blood: boolean;
}

const BASE: ImpactPreset = {
  sparks: 6,
  puffs: 4,
  debris: 5,
  sparkColor: 0xffb056,
  puffColor: 0x9a938a,
  puffSize: 0.5,
  decal: true,
  decalColor: 0x1a1a1e,
  splash: false,
  blood: false,
};

export const IMPACTS: Record<VfxSurface, ImpactPreset> = {
  concrete: { ...BASE, sparks: 4, puffs: 6, puffColor: 0xb8b2a6, decalColor: 0x2a2a2c },
  metal: { ...BASE, sparks: 16, puffs: 2, debris: 3, sparkColor: 0xffd089, puffColor: 0x8a8a8a },
  wood: { ...BASE, sparks: 3, puffs: 4, debris: 8, sparkColor: 0xd8a05a, puffColor: 0x8a6a44, decalColor: 0x3a2a18 },
  glass: { ...BASE, sparks: 10, puffs: 1, debris: 12, sparkColor: 0xbfe6ff, puffColor: 0xcfe6f2, decal: false },
  water: { ...BASE, sparks: 0, puffs: 6, debris: 8, puffColor: 0xbcd2de, puffSize: 0.6, decal: false, splash: true },
  flesh: { ...BASE, sparks: 0, puffs: 5, debris: 6, puffColor: 0x8e1b1b, puffSize: 0.4, decalColor: 0x3a0808, blood: true },
  sand: { ...BASE, sparks: 0, puffs: 8, debris: 6, puffColor: 0xcdb383, puffSize: 0.6, decalColor: 0x5a4a30 },
  dirt: { ...BASE, sparks: 0, puffs: 7, debris: 7, puffColor: 0x8a6f4c, puffSize: 0.55, decalColor: 0x3a2c1c },
  foliage: { ...BASE, sparks: 0, puffs: 4, debris: 10, puffColor: 0x4f7a3a, puffSize: 0.45, decal: false },
};

export function impactFor(surface?: VfxSurface): ImpactPreset {
  return surface ? IMPACTS[surface] : (IMPACTS.concrete as ImpactPreset);
}

/** Muzzle-flash tuning. */
export const MUZZLE = {
  flashColor: 0xfff0c4,
  flashSize: 0.9,
  smokeColor: 0x7d7873,
  lightColor: 0xffd27a,
  lightIntensity: 6,
  lightDistance: 6,
  lightLife: 0.06,
  bloom: 0.1,
} as const;

/** Explosion tuning (custom-core layers; quarks adds the batched fireball/smoke on top). */
export const EXPLOSION = {
  flashColor: 0xffe3a0,
  coreColor: 0xffa63a,
  sparkColor: 0xffd27a,
  smokeColor: 0x2b2b2e,
  emberColor: 0xff9a3a,
  lightColor: 0xffb060,
  lightIntensity: 14,
  lightDistance: 20,
  lightLife: 0.5,
  bloom: 0.9,
} as const;
