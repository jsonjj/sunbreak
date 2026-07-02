import type { Vec3Tuple } from "../types/math";

// World layout constants (Santa Vista). Kept small for v0; grows with the WORLD subsystem.

export const MAP_SIZE = 2000; // meters, full playable extent (target)
export const CHUNK_SIZE = 100; // streaming chunk edge length
export const DAY_LENGTH_S = 1200; // seconds for a full day/night cycle

/** Player spawn points. v0 uses the first entry. */
export const SPAWN_POINTS: Vec3Tuple[] = [
  [0, 2, 6],
  [10, 2, 10],
  [-10, 2, -10],
];

export const DEFAULT_SPAWN: Vec3Tuple = SPAWN_POINTS[0]!;
