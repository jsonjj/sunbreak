// Tiny deterministic PRNG + math helpers. Deterministic RNG keeps ambient crowds reproducible
// (aligns with the v4 "seeded client-local crowd" goal) and avoids Math.random ordering issues.

/** mulberry32 — fast, seedable, good-enough integer PRNG (mirrors City-Gen's prng). */
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

/** Shared crowd RNG. Seeded from a fixed value for reproducibility; reseed via `reseed`. */
export let rand: () => number = mulberry32(0x5a17b3ea);
export function reseed(seed: number): void {
  rand = mulberry32(seed);
}

/** Uniform in [min,max). */
export const rangeR = (rng: () => number, min: number, max: number): number =>
  min + (max - min) * rng();

/** Weighted key pick. `weights` values need not be normalised. */
export function weightedPick<K extends string | number>(
  weights: Record<K, number>,
  rng: () => number,
): K {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  let last!: K;
  for (const k in weights) {
    last = k as unknown as K;
    r -= weights[k as keyof typeof weights];
    if (r <= 0) return k as unknown as K;
  }
  return last;
}
