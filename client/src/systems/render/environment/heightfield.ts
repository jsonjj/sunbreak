// Terrain heightfield — the single source of truth for "how tall is the ground here".
// Both the rendered mesh and the (physics-owned) Rapier collider derive from sampleHeight(),
// so visuals and collision never desync. Deterministic (seeded), so every client reproduces it.

import * as THREE from "three";
import {
  BAY_CENTER,
  BEACH_DEPTH,
  BUILT_HALF,
  ENV_SEED,
  HEIGHTFIELD_RES,
  SEABED_SLOPE,
  WATER_LEVEL,
} from "./constants";
import {
  coastInset,
  marinaMask,
  gladesMask as geoGladesMask,
  LAND_HEIGHT,
  SHORE_HEIGHT,
  MARINA,
  GLADES_FLOOR,
} from "@/systems/render/city/geography";
import {
  biomeWeights,
  classifyBiome,
  surfaceTagFor,
  TERRAIN_PALETTE,
  type EnvBiomeId,
  type SurfaceTag,
  type SurfaceWeights,
} from "./biomes";
import { clamp01, fbm, ridged, smoothstep } from "./noise";

/** Consolidated heightfield payload handed to the physics subsystem (serialisable POJO). */
export interface EnvHeightfield {
  /** Samples per axis (square grid, inclusive). */
  res: number;
  /** Metres between adjacent samples. */
  cellSize: number;
  /** World-space min corner of the grid. */
  origin: { x: number; z: number };
  /** Row-major heights in metres: heights[iz * res + ix]. ix→+X, iz→+Z. */
  heights: number[];
  min: number;
  max: number;
}

export interface SurfaceSample {
  height: number;
  /** 0 (flat) → 1 (vertical). */
  slope: number;
  biome: EnvBiomeId;
  tag: SurfaceTag;
  weights: SurfaceWeights;
}

// ---- Height function --------------------------------------------------------------------

/**
 * Terrain elevation (metres) at world (x, z) for the coastal ISLAND. Land is a flat plateau
 * (kept just under the city ground slab so the slab always wins the depth test — and always
 * ABOVE the waterline so the ocean can never draw over it), ramping down to a beach at the
 * wobbly coastline and then to seabed out at sea. Two carved water bodies (Marina, Glades) dip
 * below the waterline. Negative = below sea level (seabed / harbour / marsh floor).
 */
export function sampleHeight(x: number, z: number): number {
  const inset = coastInset(x, z); // >0 inland, ≈0 at the waterline, <0 out at sea

  let h: number;
  if (inset >= BEACH_DEPTH) {
    // Dry inland plateau. Micro-noise ONLY (kept tiny) so the whole buildable island stays flat
    // enough that grid-aligned buildings never float or sink and the collision plane is stable.
    h = LAND_HEIGHT + fbm(x * 0.05, z * 0.05, ENV_SEED + 37, 3) * 0.08;
  } else if (inset >= 0) {
    // Beach ramp: waterline height up to the plateau over the beach band.
    const t = smoothstep(0, BEACH_DEPTH, inset);
    h = SHORE_HEIGHT + (LAND_HEIGHT - SHORE_HEIGHT) * t + fbm(x * 0.06, z * 0.06, ENV_SEED + 31, 2) * 0.05;
  } else {
    // Seabed sloping away from the coast, gentle ripples.
    h = SHORE_HEIGHT + inset * SEABED_SLOPE + fbm(x * 0.02, z * 0.02, ENV_SEED + 41, 3) * 0.45;
  }

  // Carve the Marina harbour basin (calm hero-water body): pull terrain below sea level.
  const bay = marinaMask(x, z);
  if (bay > 0) {
    const floor = MARINA.floor + fbm(x * 0.03, z * 0.03, ENV_SEED + 53, 3) * 0.4;
    h = h * (1 - bay) + Math.min(h, floor) * bay;
  }

  // Flatten the Glades to muddy flats just under standing water, with occasional cypress hummocks.
  const glades = geoGladesMask(x, z);
  if (glades > 0) {
    const hummock = Math.max(0, ridged(x * 0.05, z * 0.05, ENV_SEED + 67, 3) - 0.55) * 2.2;
    const floor = GLADES_FLOOR + hummock + fbm(x * 0.06, z * 0.06, ENV_SEED + 71, 2) * 0.2;
    h = h * (1 - glades) + floor * glades;
  }

  return h;
}

const EPS = 0.6;

/** Analytic surface normal via central differences of {@link sampleHeight} (seamless across tiles). */
export function sampleNormal(x: number, z: number, target?: THREE.Vector3): THREE.Vector3 {
  const out = target ?? new THREE.Vector3();
  const hL = sampleHeight(x - EPS, z);
  const hR = sampleHeight(x + EPS, z);
  const hD = sampleHeight(x, z - EPS);
  const hU = sampleHeight(x, z + EPS);
  const dhdx = (hR - hL) / (2 * EPS);
  const dhdz = (hU - hD) / (2 * EPS);
  return out.set(-dhdx, 1, -dhdz).normalize();
}

/** Slope steepness in [0, 1] (0 flat, 1 vertical). */
export function sampleSlope(x: number, z: number): number {
  const n = sampleNormal(x, z);
  return clamp01(1 - n.y);
}

/** Full surface description at a point — for footsteps, wheels, ambience surface tags. */
export function surfaceAt(x: number, z: number): SurfaceSample {
  const height = sampleHeight(x, z);
  const slope = sampleSlope(x, z);
  const biome = classifyBiome(x, z, height);
  const weights = biomeWeights(x, z, height, slope);
  const tag = surfaceTagFor(height, slope, weights);
  return { height, slope, biome, tag, weights };
}

// ---- Terrain colouring (linear-space splat blend baked to vertex colours) ----------------

const C = {
  sandDry: new THREE.Color(TERRAIN_PALETTE.sandDry),
  sandWet: new THREE.Color(TERRAIN_PALETTE.sandWet),
  grass: new THREE.Color(TERRAIN_PALETTE.grass),
  grassDark: new THREE.Color(TERRAIN_PALETTE.grassDark),
  mud: new THREE.Color(TERRAIN_PALETTE.mud),
  rock: new THREE.Color(TERRAIN_PALETTE.rock),
  seabed: new THREE.Color(TERRAIN_PALETTE.seabed),
};

const _sand = new THREE.Color();
const _grass = new THREE.Color();

function terrainColor(
  x: number,
  z: number,
  height: number,
  slope: number,
  out: THREE.Color,
): THREE.Color {
  const w = biomeWeights(x, z, height, slope);
  const wet = clamp01(1 - (height - WATER_LEVEL) / 0.9); // wetten sand near the waterline
  _sand.copy(C.sandDry).lerp(C.sandWet, clamp01(wet));
  const grassVar = fbm(x * 0.04, z * 0.04, ENV_SEED + 83, 2) * 0.5 + 0.5;
  _grass.copy(C.grass).lerp(C.grassDark, grassVar);

  const r = _sand.r * w.sand + _grass.r * w.grass + C.mud.r * w.mud + C.rock.r * w.rock;
  const g = _sand.g * w.sand + _grass.g * w.grass + C.mud.g * w.mud + C.rock.g * w.rock;
  const b = _sand.b * w.sand + _grass.b * w.grass + C.mud.b * w.mud + C.rock.b * w.rock;
  out.setRGB(r, g, b);

  if (height < WATER_LEVEL - 0.1) out.lerp(C.seabed, clamp01((WATER_LEVEL - height) / 3));
  return out;
}

// ---- Tile geometry ----------------------------------------------------------------------

/**
 * Build one terrain tile as an indexed BufferGeometry in world space (Y-up), with position,
 * analytic normals, uv (0..1), and baked splat vertex colours.
 */
export function buildTileGeometry(
  originX: number,
  originZ: number,
  size: number,
  segments: number,
): THREE.BufferGeometry {
  const n = segments + 1;
  const count = n * n;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const step = size / segments;

  const nrm = new THREE.Vector3();
  const col = new THREE.Color();

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const vi = iz * n + ix;
      const x = originX + ix * step;
      const z = originZ + iz * step;
      const h = sampleHeight(x, z);
      const slope = sampleSlope(x, z);

      positions[vi * 3] = x;
      positions[vi * 3 + 1] = h;
      positions[vi * 3 + 2] = z;

      sampleNormal(x, z, nrm);
      normals[vi * 3] = nrm.x;
      normals[vi * 3 + 1] = nrm.y;
      normals[vi * 3 + 2] = nrm.z;

      uvs[vi * 2] = ix / segments;
      uvs[vi * 2 + 1] = iz / segments;

      terrainColor(x, z, h, slope, col);
      colors[vi * 3] = col.r;
      colors[vi * 3 + 1] = col.g;
      colors[vi * 3 + 2] = col.b;
    }
  }

  const indices: number[] = [];
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ---- Consolidated heightfield for physics -----------------------------------------------

let cachedHeightfield: EnvHeightfield | null = null;

/** Build (and cache) the consolidated heightfield grid handed to the physics subsystem. */
export function buildHeightfield(): EnvHeightfield {
  if (cachedHeightfield) return cachedHeightfield;
  const res = HEIGHTFIELD_RES;
  const cellSize = (BUILT_HALF * 2) / (res - 1);
  const origin = { x: -BUILT_HALF, z: -BUILT_HALF };
  const heights = new Array<number>(res * res);
  let min = Infinity;
  let max = -Infinity;
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const h = sampleHeight(origin.x + ix * cellSize, origin.z + iz * cellSize);
      heights[iz * res + ix] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  cachedHeightfield = { res, cellSize, origin, heights, min, max };
  return cachedHeightfield;
}

/** Convenience alias matching the spec's `heightfieldRows()` name. */
export const heightfieldRows = buildHeightfield;

export { BAY_CENTER };
