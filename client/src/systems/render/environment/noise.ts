// Tiny deterministic value-noise + fbm. Replaces `simplex-noise` (not pre-installed) with a
// dependency-free, allocation-free implementation. Identical output on every client/server for
// the same (x, z, seed) so terrain + scatter reproduce the same world everywhere.

const HASH_A = 1597334677;
const HASH_B = 3812015801;

/** Deterministic 32-bit hash of two integers + seed → float in [0, 1). */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix | 0) * HASH_A ^ (iz | 0) * HASH_B ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 1 | HASH_A);
  h ^= h + Math.imul(h ^ (h >>> 7), 1 | HASH_B);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth value noise in [0, 1]. */
export function valueNoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fade(fx);
  const v = fade(fz);

  const c00 = hash2(x0, z0, seed);
  const c10 = hash2(x0 + 1, z0, seed);
  const c01 = hash2(x0, z0 + 1, seed);
  const c11 = hash2(x0 + 1, z0 + 1, seed);

  return lerp(lerp(c00, c10, u), lerp(c01, c11, u), v);
}

/** Signed value noise in [-1, 1]. */
export function noise2(x: number, z: number, seed: number): number {
  return valueNoise2(x, z, seed) * 2 - 1;
}

/** Fractal Brownian motion (summed octaves), normalised to ~[-1, 1]. */
export function fbm(
  x: number,
  z: number,
  seed: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, z * freq, seed + o * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged fbm (sharper crests) in [0, 1] — handy for dunes / cypress hummocks. */
export function ridged(x: number, z: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise2(x * freq, z * freq, seed + o * 2749));
    sum += amp * n * n;
    amp *= 0.5;
    freq *= 2;
  }
  return Math.min(1, sum);
}

/** Smoothstep helper mirrored from GLSL. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
