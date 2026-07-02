// Environment subsystem constants & shared types.
// Owned by render/environment. All world geometry (terrain, water, foliage, props) derives
// deterministically from these + shared world constants so client and server agree.

import { CHUNK_SIZE, MAP_SIZE } from "@sunbreak/shared";
import {
  BUILT_HALF as GEO_BUILT_HALF,
  GLADES as GEO_GLADES,
  GLADES_LEVEL as GEO_GLADES_LEVEL,
  MARINA as GEO_MARINA,
  WATER_LEVEL as GEO_WATER_LEVEL,
  BEACH_WIDTH as GEO_BEACH_WIDTH,
} from "@/systems/render/city/geography";

/** Master seed for every deterministic generator in this subsystem (noise, scatter). */
export const ENV_SEED = 0x5c0d98d8;

/** Water plane elevation in metres (canonical, from the shared island geography). Kept BELOW the
 *  flat city ground so the ocean plane can only ever draw over genuine sea — see ./water. */
export const WATER_LEVEL = GEO_WATER_LEVEL;

/** Half-extent of the built terrain area (metres). Sourced from the shared geography so terrain
 *  reaches past the world boundary walls (open ocean renders beyond, toward the horizon). */
export const BUILT_HALF = GEO_BUILT_HALF;

/** Terrain tile edge length (metres). A divisor-friendly fraction of the streaming chunk. */
export const TILE_SIZE = 128;

/** Tiles per axis across the built extent (centred on origin, sized to cover ±BUILT_HALF). */
export const TILES_PER_AXIS = Math.max(1, Math.round((BUILT_HALF * 2) / TILE_SIZE));

/** Full built extent (metres, square, centred on origin). */
export const BUILT_EXTENT = Math.min(TILES_PER_AXIS * TILE_SIZE, MAP_SIZE);

/** Consolidated heightfield resolution handed to physics (samples per axis, inclusive grid). */
export const HEIGHTFIELD_RES = 161; // 160 cells + 1 (covers the larger island at ~8 m spacing)

// ---- Shoreline / bay / wetland layout (world XZ, metres) --------------------------------
// Convention: +X east, +Z south, -Z north, +Y up. The world is an ISLAND (see city/geography):
// the coastline is a wobbly rounded rectangle around the whole city; open sea lies beyond it,
// with a carved south-west Marina harbour and a north-east Glades marsh.

export const BEACH_DEPTH = GEO_BEACH_WIDTH; // metres of beach ramp between plateau and waterline
export const SEABED_SLOPE = 0.06; // how fast the seabed drops going out to sea

/** Marina harbour centre — the single hero-reflector water body (south-west docks). */
export const BAY_CENTER = { x: GEO_MARINA.x, z: GEO_MARINA.z } as const;
export const BAY_RADIUS = GEO_MARINA.radius;

/** Glades marsh region — murky shallow water + sawgrass/cypress/mangrove (north-east coast). */
export const GLADES_CENTER = { x: GEO_GLADES.x, z: GEO_GLADES.z } as const;
export const GLADES_RADIUS = GEO_GLADES.radius;
export const GLADES_WATER_LEVEL = GEO_GLADES_LEVEL; // shallow standing-water surface

// Scatter search regions — bounding foliage/prop candidates to a footprint keeps the
// deterministic scatter cheap at boot (avoids sampling the whole map for localized species).
// The beach ring hugs the whole coastline, so coastal scatter searches the full built extent.
export const COAST_BOUNDS = { minX: -BUILT_HALF, maxX: BUILT_HALF, minZ: -BUILT_HALF, maxZ: BUILT_HALF };
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
