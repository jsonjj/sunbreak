// Per-instance crowd appearance generation. Self-contained (no character-content coupling): curated
// skin / hair / top / bottom pools, biased per archetype, plus a build (width/height) and hat roll.
// Deterministic given the caller's RNG so a crowd is reproducible.

import { PedArchetype } from "@sunbreak/shared";
import type { CrowdAppearance } from "./pedInstances";

/** Appearance colours + hat flag, plus the per-instance build scale used by the render matrix. */
export interface CrowdLook extends CrowdAppearance {
  bodyW: number;
  bodyH: number;
}

const SKIN: readonly number[] = [
  0xf7d7c4, 0xf0c4a4, 0xe6ac86, 0xd69f76, 0xc88a5e, 0xb97f50, 0xa06a42, 0x8d5a34, 0x6f4529, 0x5e3a22,
];

const HAIR: readonly number[] = [
  0x141210, 0x201a16, 0x2e2018, 0x4a3120, 0x6b4326, 0x9a6a34, 0xc9b489, 0xded2a8, 0x8a8f95, 0xb9bec4,
  0x5a3038, 0x33474a,
];

const TOP_BY: Record<PedArchetype, readonly number[]> = {
  [PedArchetype.Civilian]: [
    0x3a4a63, 0x455a4b, 0x7a3b3b, 0x8a7a3b, 0x4a3b63, 0x5a6b7a, 0x874b6a, 0x2f6b63, 0x9c9488, 0xc2c7cc,
  ],
  [PedArchetype.Business]: [0x2b3345, 0x3a3f4a, 0x4a4e57, 0x5b4636, 0x2f3b45, 0x4d4a53],
  [PedArchetype.Tourist]: [0xc94f4f, 0xd99b2b, 0x3f8f8f, 0xe0c15a, 0x4a8f5a, 0xd76c9c, 0x4f7fd7, 0xef7f3f],
  [PedArchetype.Gangster]: [0x2a2a2e, 0x5a1f1f, 0x1f3a2a, 0x3a2a4a, 0x40332a, 0x1e1e22],
  [PedArchetype.Police]: [0x22304a, 0x27364f],
};

const BOTTOM_BY: Record<PedArchetype, readonly number[]> = {
  [PedArchetype.Civilian]: [0x2c3038, 0x3a4048, 0x2f3f52, 0x5b5346, 0x454138, 0x7c756a],
  [PedArchetype.Business]: [0x2b2f38, 0x33373f, 0x3d4048, 0x4a4436],
  [PedArchetype.Tourist]: [0x5b6470, 0x7c756a, 0x8a8272, 0x4a5560, 0x5b5346],
  [PedArchetype.Gangster]: [0x1f2024, 0x26292e, 0x2c2a30, 0x332e2a],
  [PedArchetype.Police]: [0x1c2434, 0x20283a],
};

const HAT_CHANCE: Record<PedArchetype, number> = {
  [PedArchetype.Civilian]: 0.16,
  [PedArchetype.Business]: 0.05,
  [PedArchetype.Tourist]: 0.55,
  [PedArchetype.Gangster]: 0.42,
  [PedArchetype.Police]: 1.0,
};

// Build bias per archetype (mean width multiplier). Height stays close to 1 so peds match the sim
// capsule; width carries most of the silhouette variety.
const WIDTH_BIAS: Record<PedArchetype, number> = {
  [PedArchetype.Civilian]: 1.0,
  [PedArchetype.Business]: 0.96,
  [PedArchetype.Tourist]: 1.03,
  [PedArchetype.Gangster]: 1.06,
  [PedArchetype.Police]: 1.05,
};

function pick(arr: readonly number[], rng: () => number): number {
  return arr[(rng() * arr.length) | 0] ?? arr[0]!;
}

/** Roll a full per-instance crowd look for an archetype. */
export function crowdLook(arch: PedArchetype, rng: () => number): CrowdLook {
  return {
    skin: pick(SKIN, rng),
    top: pick(TOP_BY[arch] ?? TOP_BY[PedArchetype.Civilian], rng),
    bottom: pick(BOTTOM_BY[arch] ?? BOTTOM_BY[PedArchetype.Civilian], rng),
    hair: pick(HAIR, rng),
    hasHat: rng() < (HAT_CHANCE[arch] ?? 0.15),
    bodyW: (WIDTH_BIAS[arch] ?? 1) * (0.93 + rng() * 0.16),
    bodyH: 0.97 + rng() * 0.09,
  };
}
