// Deterministic scatter: seeded, jittered-grid (blue-noise-ish) placement over a density mask.
// Same input → same transforms on every client, so foliage/props reproduce identically and can
// be reused by AI/traffic/mission placement later. No allocation beyond the returned array.

import { BUILT_HALF, ENV_SEED } from "./constants";
import { groundKindAt } from "@/systems/render/city/geography";
import { hash2 } from "./noise";
import { sampleHeight, sampleSlope, surfaceAt, type SurfaceSample } from "./heightfield";

export interface ScatterInstance {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

export interface ScatterConfig {
  /** Unique per species so channels don't correlate. */
  channel: number;
  /** Candidate grid spacing (metres). Smaller = denser. */
  spacing: number;
  /** Jitter as a fraction of spacing (0..1). */
  jitter?: number;
  /** Acceptance probability in [0,1] from the surface sample. */
  density: (x: number, z: number, s: SurfaceSample) => number;
  minHeight?: number;
  maxHeight?: number;
  maxSlope?: number;
  minScale: number;
  maxScale: number;
  /** Hard cap; excess is deterministically strided out. */
  maxCount: number;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const DEFAULT_BOUNDS = {
  minX: -BUILT_HALF,
  maxX: BUILT_HALF,
  minZ: -BUILT_HALF,
  maxZ: BUILT_HALF,
};

/** Generate deterministic instance transforms for one species/layer. */
export function scatterField(cfg: ScatterConfig): ScatterInstance[] {
  const b = cfg.bounds ?? DEFAULT_BOUNDS;
  const jitter = cfg.jitter ?? 0.85;
  const seed = ENV_SEED ^ (cfg.channel * 0x9e3779b1);
  const out: ScatterInstance[] = [];

  const cols = Math.max(1, Math.floor((b.maxX - b.minX) / cfg.spacing));
  const rows = Math.max(1, Math.floor((b.maxZ - b.minZ) / cfg.spacing));

  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const hx = hash2(ix, iz, seed);
      const hz = hash2(ix, iz, seed + 1);
      const x = b.minX + (ix + 0.5 + (hx - 0.5) * jitter) * cfg.spacing;
      const z = b.minZ + (iz + 0.5 + (hz - 0.5) * jitter) * cfg.spacing;

      // Never scatter env foliage/props on the city's paved ground (dark urban slab) or the
      // airfield apron — those belong to render/city. (Parks + open coast/marsh still scatter.)
      const gk = groundKindAt(x, z);
      if (gk === "urban" || gk === "apron") continue;

      // Cheap reject before the fuller surface sample.
      const h = sampleHeight(x, z);
      if (cfg.minHeight !== undefined && h < cfg.minHeight) continue;
      if (cfg.maxHeight !== undefined && h > cfg.maxHeight) continue;
      if (cfg.maxSlope !== undefined && sampleSlope(x, z) > cfg.maxSlope) continue;

      const s = surfaceAt(x, z);
      const p = cfg.density(x, z, s);
      if (p <= 0) continue;
      if (hash2(ix, iz, seed + 2) > p) continue;

      const scale = cfg.minScale + (cfg.maxScale - cfg.minScale) * hash2(ix, iz, seed + 3);
      const rotationY = hash2(ix, iz, seed + 4) * Math.PI * 2;
      out.push({ x, y: h, z, rotationY, scale });
    }
  }

  // Deterministic subsample if we blew the budget (stride keeps spatial spread).
  if (out.length > cfg.maxCount) {
    const stride = out.length / cfg.maxCount;
    const trimmed: ScatterInstance[] = [];
    for (let i = 0; i < cfg.maxCount; i++) {
      const item = out[Math.floor(i * stride)];
      if (item) trimmed.push(item);
    }
    return trimmed;
  }
  return out;
}
