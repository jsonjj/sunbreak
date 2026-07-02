// Deterministic PRNG for cross-engine-stable city generation. Integer math only so the
// same seed yields a byte-identical city on every client/peer (multiplayer determinism).
//
// NOTE (integrator): this ideally lives in `shared/` so traffic/peds can import the exact
// same generator. It is owned here for now and re-exported from the subsystem's public API
// (`@/systems/render/city`). Move to `shared/src/citygen/prng.ts` when the shared package
// opens up; keep the implementation byte-identical.

export type Rng = () => number;

/** mulberry32 — tiny, fast, stable 32-bit PRNG returning a float in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** splitmix32 — used to derive independent sub-streams from a master seed. */
export function splitmix32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/** Derive a stable child seed from a parent seed + a string tag (FNV-1a mix). */
export function deriveSeed(seed: number, tag: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── convenience helpers over an Rng ──────────────────────────────────────────

/** Float in [min, max). */
export const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

/** Integer in [min, max] inclusive. */
export const rangeInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(min + rng() * (max - min + 1));

/** true with probability p. */
export const chance = (rng: Rng, p: number): boolean => rng() < p;

/** Symmetric jitter in [-amt, amt). */
export const jitter = (rng: Rng, amt: number): number => (rng() - 0.5) * 2 * amt;

/** Pick a uniformly random element (undefined only for empty arrays). */
export function pick<T>(rng: Rng, arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** Weighted pick. `weights` must align with `items` and sum > 0. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T | undefined {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0 || items.length === 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
