// Shared context handed to every emitter: the particle cores + scratch spawn descriptors +
// budget/quality + helpers. Emitters mutate the scratch objects and call `core.spawn(scratch)`
// so no garbage is produced while emitting thousands of particles.
import type { TierCaps, VfxEvent } from "../types";
import type { Billboards, BillboardSpawn } from "../particles/Billboards";
import type { Points, PointSpawn } from "../particles/Points";
import type { GroundDecals } from "../particles/GroundDecals";
import type { LightPool } from "../core/lights";
import type { QuarksHero } from "../core/QuarksHero";

export interface EmitContext {
  /** Additive glow billboards (flash, fireball, hot puffs). */
  fire: Billboards;
  /** Alpha billboards (smoke, dust, exhaust, splash). */
  smoke: Billboards;
  /** Additive point sprites (sparks, embers, debris, droplets). */
  sparks: Points;
  /** Ground decal ring buffer (skid, scorch, blood). */
  decals: GroundDecals;
  /** Pooled dynamic flash lights. */
  lights: LightPool;
  /** three.quarks hero explosion layer. */
  hero: QuarksHero;
  /** Current tier caps. */
  caps: TierCaps;
  /** Governor quality 0..1 (ambient sheds first under load). */
  quality: number;
  /** Push a bloom pulse. */
  bloom: (amount: number) => void;
  /** Reused billboard spawn descriptor. */
  bb: BillboardSpawn;
  /** Reused point spawn descriptor. */
  pt: PointSpawn;
}

/** Deterministic PRNG (mulberry32) — used when an event carries a `seed` (v4 netcode). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick the RNG for an event: seeded (deterministic) or Math.random. */
export function rngFor(e: VfxEvent): () => number {
  return e.seed !== undefined ? mulberry32(e.seed) : Math.random;
}

/** Unpack 0xRRGGBB into 0..1 channels on a reused output (no alloc). */
export interface RGB {
  r: number;
  g: number;
  b: number;
}
export function unpackHex(hex: number, out: RGB): RGB {
  out.r = ((hex >> 16) & 0xff) / 255;
  out.g = ((hex >> 8) & 0xff) / 255;
  out.b = (hex & 0xff) / 255;
  return out;
}

/** Scratch RGB slots (emitters run sequentially, single-threaded). */
export const rgbA: RGB = { r: 1, g: 1, b: 1 };
export const rgbB: RGB = { r: 1, g: 1, b: 1 };

/** Normalize a direction-ish vector into `out` (falls back to +Z). */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}
export function normalizeDir(x: number, y: number, z: number, out: XYZ): XYZ {
  const len = Math.hypot(x, y, z);
  if (len < 1e-5) {
    out.x = 0;
    out.y = 0;
    out.z = 1;
  } else {
    out.x = x / len;
    out.y = y / len;
    out.z = z / len;
  }
  return out;
}

export const dirScratch: XYZ = { x: 0, y: 0, z: 1 };
export const dirScratch2: XYZ = { x: 0, y: 0, z: 1 };
