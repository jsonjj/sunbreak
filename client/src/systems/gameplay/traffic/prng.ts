// Inline mulberry32 PRNG. The plan reuses City-Gen's `mulberry32`, but that lives in another
// subsystem's folder (and shared/ is off-limits), so we ship an identical implementation here for
// deterministic, MP-stable ambient spawning (v4). Same algorithm → cosmetically equivalent output.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform int in [min, max]. */
export const randInt = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/** Uniform float in [min, max). */
export const randRange = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
