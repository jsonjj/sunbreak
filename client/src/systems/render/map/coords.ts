// World <-> basemap-pixel transforms + small geometry helpers.
//
// World is the Three.js X/Z ground plane (X east, Z south). The basemap raster is oriented so that
// north (−Z) is up: basemap px (0,0) = the NW corner (bounds.min). Everything downstream (minimap
// crop, full-map blit, click-to-waypoint) composes from these two functions.
import { PX_PER_M } from "./mapConstants";
import { SANTA_VISTA_MAP } from "./mapData";
import type { Vec2 } from "./mapTypes";

export const MAP_BOUNDS = SANTA_VISTA_MAP.bounds;

export const BASEMAP_W = Math.round((MAP_BOUNDS.max.x - MAP_BOUNDS.min.x) * PX_PER_M);
export const BASEMAP_H = Math.round((MAP_BOUNDS.max.z - MAP_BOUNDS.min.z) * PX_PER_M);

/** World metres → basemap pixels (top-left origin). */
export function worldToBasePx(x: number, z: number): { x: number; y: number } {
  return { x: (x - MAP_BOUNDS.min.x) * PX_PER_M, y: (z - MAP_BOUNDS.min.z) * PX_PER_M };
}

/** Basemap pixels → world metres (inverse of `worldToBasePx`). */
export function basePxToWorld(px: number, py: number): Vec2 {
  return { x: px / PX_PER_M + MAP_BOUNDS.min.x, z: py / PX_PER_M + MAP_BOUNDS.min.z };
}

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const dist = (ax: number, az: number, bx: number, bz: number): number =>
  Math.sqrt(dist2(ax, az, bx, bz));

export const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate-independent exponential smoothing (same feel as THREE.MathUtils.damp). */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Standard even-odd ray-cast point-in-polygon (used for the "current district" readout). */
export function pointInPoly(px: number, pz: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect =
      a.z > pz !== b.z > pz && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function centroid(poly: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, z: z / n };
}

/** Squared distance from point p to segment ab (metres²). */
export function distToSegment2(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-9) return dist2(px, pz, ax, az);
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  return dist2(px, pz, ax + abx * t, az + abz * t);
}

/** Nearest distance (metres) from a point to a polyline; Infinity for an empty/one-point path. */
export function distToPolyline(px: number, pz: number, pts: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d2 = distToSegment2(px, pz, a.x, a.z, b.x, b.z);
    if (d2 < best) best = d2;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

/** Compass bearing (radians, 0 = north/up, clockwise) for a world delta. */
export function bearingOf(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}

/** 8-point compass word for a bearing (accessibility readout). */
export function compassWord(bearingRad: number): string {
  const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const idx = Math.round(((bearingRad % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
  return dirs[idx]!;
}
