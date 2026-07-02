// Chunk grid + ring math. Pure functions, no THREE/React — safe to unit-test headless and to
// share with a (v4) server. CELL is anchored to the shared world constant so the whole game
// agrees on one grid.
import { CHUNK_SIZE } from "@sunbreak/shared";

/** Edge length of a streaming cell, in meters (shared world constant). */
export const CELL = CHUNK_SIZE;

/** Extra distance (m) a chunk must exceed BEYOND its load ring before it unloads. Prevents
 *  load/unload thrash when the player oscillates across a cell boundary. */
export const HYSTERESIS = 24;

export interface ChunkCoord {
  cx: number;
  cz: number;
}

/** World XZ → integer chunk coordinate. */
export const worldToChunk = (x: number, z: number): ChunkCoord => ({
  cx: Math.floor(x / CELL),
  cz: Math.floor(z / CELL),
});

/** Stable string key for a chunk coordinate ("cx:cz"). */
export const chunkKey = (c: ChunkCoord): string => `${c.cx}:${c.cz}`;

/** Inverse of chunkKey. */
export const parseChunkKey = (key: string): ChunkCoord => {
  const i = key.indexOf(":");
  return { cx: Number.parseInt(key.slice(0, i), 10), cz: Number.parseInt(key.slice(i + 1), 10) };
};

/** World-space center of a chunk cell. */
export const chunkCenter = (c: ChunkCoord): { x: number; z: number } => ({
  x: c.cx * CELL + CELL * 0.5,
  z: c.cz * CELL + CELL * 0.5,
});

/** All chunk keys within Chebyshev radius `r` of `center` — a filled (2r+1)² square. */
export function ringChunks(center: ChunkCoord, r: number): Set<string> {
  const out = new Set<string>();
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      out.add(chunkKey({ cx: center.cx + dx, cz: center.cz + dz }));
    }
  }
  return out;
}

/** Chunk keys in the annulus (rInner, rOuter] around `center` — the HLOD far ring. */
export function annulusChunks(center: ChunkCoord, rInner: number, rOuter: number): Set<string> {
  const out = new Set<string>();
  for (let dz = -rOuter; dz <= rOuter; dz++) {
    for (let dx = -rOuter; dx <= rOuter; dx++) {
      const cheb = Math.max(Math.abs(dx), Math.abs(dz));
      if (cheb > rInner && cheb <= rOuter) {
        out.add(chunkKey({ cx: center.cx + dx, cz: center.cz + dz }));
      }
    }
  }
  return out;
}

/** Squared planar distance from a world point to a chunk's center. */
export function chunkDistSq(c: ChunkCoord, x: number, z: number): number {
  const cc = chunkCenter(c);
  const dx = cc.x - x;
  const dz = cc.z - z;
  return dx * dx + dz * dz;
}

/** Chebyshev distance in cells between two chunk coords (matches ring radius semantics). */
export const chunkCheb = (a: ChunkCoord, b: ChunkCoord): number =>
  Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
