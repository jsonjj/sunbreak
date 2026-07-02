// Tiny, dependency-free deterministic RNG so ped variety is reproducible from a seed
// (same seed -> same look, which matters for network/save parity later).

/** FNV-1a string hash -> uint32. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — fast seeded PRNG returning floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a deterministic element from a non-empty array. */
export function pick<T>(arr: readonly T[], rand: () => number): T {
  if (arr.length === 0) throw new Error("char: pick() on empty array");
  const i = Math.floor(rand() * arr.length);
  return arr[i] ?? arr[0]!;
}

/** True with probability p. */
export function chance(p: number, rand: () => number): boolean {
  return rand() < p;
}
