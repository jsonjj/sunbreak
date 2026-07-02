// Environment subsystem constants & shared types.
// Owned by render/environment. All world geometry (terrain, water, foliage, props) derives
// deterministically from these + shared world constants so client and server agree.

import { CHUNK_SIZE, MAP_SIZE } from "@sunbreak/shared";

/** Master seed for every deterministic generator in this subsystem (noise, scatter). */
export const ENV_SEED = 0x5c0d98d8;

/** Water plane elevation in metres. Terrain below this is seabed / submerged. */
export const WATER_LEVEL = 0;

/**
 * Bounded coastal area we actually build meshes for in v1 (Costa Dorada strip + bay).
 * The full playable target is {@link MAP_SIZE}; streaming beyond this bound is a v2 concern,
 * so we clamp the built extent to keep boot-time geometry + memory sane.
 */
export const BUILT_EXTENT = Math.min(1024, MAP_SIZE); // metres (square, centred on origin)

/** Terrain tile edge length (metres). A divisor-friendly fraction of the streaming chunk. */
export const TILE_SIZE = 128;

/** Tiles per axis across the built extent (kept odd-friendly; centred on origin). */
export const TILES_PER_AXIS = Math.max(1, Math.round(BUILT_EXTENT / TILE_SIZE));

/** Half-extent helper (metres) of the built terrain area. */
export const BUILT_HALF = (TILES_PER_AXIS * TILE_SIZE) / 2;

/** Consolidated heightfield resolution handed to physics (samples per axis, inclusive grid). */
export const HEIGHTFIELD_RES = 129; // 128 cells + 1

// ---- Shoreline / bay / wetland layout (world XZ, metres) --------------------------------
// Convention: +X east, +Z south, -Z north, +Y up. Ocean lies to the south (+Z); the beach
// strip and inland terrain to the north (-Z). Spawn (0,2,6) sits just inland of the waterline.

// Waterline sits just south of the spawn point (0,2,6) so the player starts on gentle sand
// (~0 m) — visuals line up with the v0 ground plane until physics builds the heightfield collider.
export const SHORE_Z = 8; // nominal waterline latitude (before per-x wobble)
export const BEACH_DEPTH = 46; // metres of beach band north of the waterline
export const SEABED_SLOPE = 0.05; // how fast the seabed drops going out to sea

/** Bay / marina centre — the single hero-reflector water body (near-shore, west of spawn). */
export const BAY_CENTER = { x: -150, z: 52 } as const;
export const BAY_RADIUS = 92;

/** Glades wetland region — murky shallow water + sawgrass/cypress/mangrove (to the west). */
export const GLADES_CENTER = { x: 300, z: -150 } as const;
export const GLADES_RADIUS = 220;
export const GLADES_WATER_LEVEL = 0.15; // shallow standing water sits just above sea level

// Scatter search regions — bounding foliage/prop candidates to the biome footprint keeps the
// deterministic scatter cheap at boot (avoids sampling the whole map for localized species).
export const COAST_BOUNDS = { minX: -BUILT_HALF, maxX: BUILT_HALF, minZ: -90, maxZ: 110 };
export const GLADES_BOUNDS = {
  minX: Math.max(-BUILT_HALF, GLADES_CENTER.x - GLADES_RADIUS * 1.2),
  maxX: Math.min(BUILT_HALF, GLADES_CENTER.x + GLADES_RADIUS * 1.2),
  minZ: Math.max(-BUILT_HALF, GLADES_CENTER.z - GLADES_RADIUS * 1.2),
  maxZ: Math.min(BUILT_HALF, GLADES_CENTER.z + GLADES_RADIUS * 1.2),
};

// ---- Quality tiers ----------------------------------------------------------------------

export type EnvKind =
  | "terrain"
  | "ocean"
  | "wetland"
  | "heroWater"
  | "foliage"
  | "props"
  | "heightfield";

export type QualityTier = "low" | "medium" | "high";

export interface EnvQualitySettings {
  /** Terrain plane segments per tile for the near LOD ring. */
  terrainSegNear: number;
  /** Segments for the far LOD ring. */
  terrainSegFar: number;
  /** Distance (m) past which a tile drops to the far segment count / is culled. */
  terrainDrawDistance: number;
  /** Enable the single planar hero reflector (the budget killer). */
  reflector: boolean;
  /** Hero reflector render-target resolution (px, square-ish). */
  reflectorRes: number;
  /** Update the reflector every N frames (throttle the planar pass). */
  reflectorEveryNFrames: number;
  /** Global foliage instance-count multiplier. */
  foliageDensity: number;
  /** Distance (m) past which foliage/props are hidden. */
  foliageDrawDistance: number;
  /** Ocean vertex-wave detail (plane segments per axis). */
  oceanSegments: number;
}

export const ENV_TIERS: Record<QualityTier, EnvQualitySettings> = {
  low: {
    terrainSegNear: 32,
    terrainSegFar: 16,
    terrainDrawDistance: 340,
    reflector: false,
    reflectorRes: 256,
    reflectorEveryNFrames: 3,
    foliageDensity: 0.4,
    foliageDrawDistance: 120,
    oceanSegments: 48,
  },
  medium: {
    terrainSegNear: 48,
    terrainSegFar: 20,
    terrainDrawDistance: 520,
    reflector: true,
    reflectorRes: 512,
    reflectorEveryNFrames: 2,
    foliageDensity: 0.75,
    foliageDrawDistance: 165,
    oceanSegments: 96,
  },
  high: {
    terrainSegNear: 64,
    terrainSegFar: 28,
    terrainDrawDistance: 720,
    reflector: true,
    reflectorRes: 1024,
    reflectorEveryNFrames: 1,
    foliageDensity: 1,
    foliageDrawDistance: 210,
    oceanSegments: 128,
  },
};

/** Re-export for downstream callers that want the streaming chunk size. */
export { CHUNK_SIZE, MAP_SIZE };
