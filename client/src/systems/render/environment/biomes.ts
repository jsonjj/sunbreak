// Biome model for Verano's coastal fabric. Pure functions of world position (+ height/slope)
// so terrain colour, foliage/prop density, and water tint all derive deterministically.
// NOTE: one-directional dependency — biomes imports constants/noise only; heightfield imports
// biomes (never the reverse) to avoid a cycle.

import {
  BAY_CENTER,
  BAY_RADIUS,
  BEACH_DEPTH,
  GLADES_CENTER,
  GLADES_RADIUS,
  SHORE_Z,
  WATER_LEVEL,
} from "./constants";
import { clamp01, fbm, smoothstep } from "./noise";

export type EnvBiomeId = "ocean" | "beach" | "bay" | "glades" | "inland";

/** Per-tile surface material weights (sum ~1) used for splat-style vertex colouring + audio tags. */
export interface SurfaceWeights {
  sand: number;
  grass: number;
  mud: number;
  rock: number;
}

/** Dominant walkable surface tag — consumed by player footsteps / vehicle wheels / audio. */
export type SurfaceTag = "sand" | "wetSand" | "grass" | "mud" | "rock" | "water" | "seabed";

const dist = (x: number, z: number, cx: number, cz: number): number =>
  Math.hypot(x - cx, z - cz);

/** Wobbly waterline latitude at a given x (metres, +Z = seaward). */
export function shorelineZ(x: number): number {
  return (
    SHORE_Z +
    18 * Math.sin(x * 0.0065) +
    9 * fbm(x * 0.02, 0, 7717, 3) +
    4 * Math.sin(x * 0.03 + 1.3)
  );
}

/** 0 inland → 1 deep in the Glades wetland footprint. */
export function gladesMask(x: number, z: number): number {
  const d = dist(x, z, GLADES_CENTER.x, GLADES_CENTER.z);
  const edge = GLADES_RADIUS * (0.85 + 0.25 * fbm(x * 0.01, z * 0.01, 3301, 3));
  return 1 - smoothstep(edge * 0.55, edge, d);
}

/** 0 outside → 1 inside the bay bowl (the single hero-reflector body). */
export function bayMask(x: number, z: number): number {
  const d = dist(x, z, BAY_CENTER.x, BAY_CENTER.z);
  return 1 - smoothstep(BAY_RADIUS * 0.6, BAY_RADIUS, d);
}

/** Region classification from position + terrain height. */
export function classifyBiome(x: number, z: number, height: number): EnvBiomeId {
  if (bayMask(x, z) > 0.5 && height < WATER_LEVEL + 0.4) return "bay";
  if (gladesMask(x, z) > 0.45) return "glades";
  if (height < WATER_LEVEL - 0.15) return "ocean";
  if (z > shorelineZ(x) - BEACH_DEPTH && height < WATER_LEVEL + 3.2) return "beach";
  return "inland";
}

/**
 * Material weights for colouring + scatter density. `slope` is 0 (flat) → 1 (vertical),
 * `height` is metres above/below sea level.
 */
export function biomeWeights(
  x: number,
  z: number,
  height: number,
  slope: number,
): SurfaceWeights {
  const glades = gladesMask(x, z);
  const seaProximity = 1 - clamp01((height - WATER_LEVEL) / 2.2); // near/below water → sandy/muddy
  const rocky = smoothstep(0.55, 0.85, slope);

  // Base: sand near the water, grass higher inland.
  let sand = clamp01(seaProximity) * (1 - glades);
  let grass = clamp01((height - WATER_LEVEL) / 6) * (1 - glades);
  let mud = glades * (0.7 + 0.3 * clamp01(seaProximity));
  let rock = rocky;

  // Micro-variation so the splat isn't banded.
  const v = fbm(x * 0.05, z * 0.05, 9091, 3) * 0.5 + 0.5;
  grass *= 0.7 + 0.6 * v;
  sand *= 0.8 + 0.4 * (1 - v);

  // Steep slopes are rock regardless of biome.
  grass *= 1 - rock;
  sand *= 1 - rock;
  mud *= 1 - rock * 0.5;

  const total = sand + grass + mud + rock || 1;
  return { sand: sand / total, grass: grass / total, mud: mud / total, rock: rock / total };
}

/** Dominant walkable surface for gameplay/audio at a point. */
export function surfaceTagFor(
  height: number,
  slope: number,
  w: SurfaceWeights,
): SurfaceTag {
  if (height < WATER_LEVEL - 0.05) return "seabed";
  if (slope > 0.7 && w.rock >= w.grass) return "rock";
  const near = height < WATER_LEVEL + 0.35;
  if (w.mud >= w.sand && w.mud >= w.grass) return "mud";
  if (w.grass >= w.sand && w.grass >= w.rock) return "grass";
  return near ? "wetSand" : "sand";
}

/** Water tint per biome (linear-ish RGB triplets, 0..1) for the ocean/wetland shaders. */
export const WATER_TINT = {
  oceanDeep: [0.035, 0.19, 0.26] as const,
  oceanShallow: [0.13, 0.52, 0.55] as const,
  bayDeep: [0.05, 0.22, 0.3] as const,
  bayShallow: [0.16, 0.55, 0.6] as const,
  wetland: [0.11, 0.16, 0.1] as const,
  wetlandShallow: [0.2, 0.24, 0.15] as const,
};

/** Terrain palette (sRGB hex) for the splat vertex colours. */
export const TERRAIN_PALETTE = {
  sandDry: 0xd9c9a3,
  sandWet: 0xb09a76,
  grass: 0x63723a,
  grassDark: 0x46542a,
  mud: 0x585036,
  rock: 0x8b8578,
  seabed: 0x726f57,
};
