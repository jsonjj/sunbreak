// Pure 2D geometry helpers on the X/Z ground plane. Axis-aligned rectangles are the workhorse
// primitive (robust grid fallback per the city-gen spec); polygons are supported for
// centroid/area/containment where districts use them.
import type { Vec2 } from "./types";

/** Axis-aligned rectangle in world coords (x0<=x1, z0<=z1). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const rectWidth = (r: Rect): number => r.x1 - r.x0;
export const rectDepth = (r: Rect): number => r.z1 - r.z0;
export const rectArea = (r: Rect): number => Math.max(0, rectWidth(r)) * Math.max(0, rectDepth(r));

export const rectCentroid = (r: Rect): Vec2 => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

/** Shrink a rectangle inward by `d` on every side (clamped so it never inverts). */
export function insetRect(r: Rect, d: number): Rect {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const x0 = Math.min(r.x0 + d, cx);
  const x1 = Math.max(r.x1 - d, cx);
  const z0 = Math.min(r.z0 + d, cz);
  const z1 = Math.max(r.z1 - d, cz);
  return { x0, z0, x1, z1 };
}

/** CCW rectangle polygon (4 points). */
export function rectPoly(r: Rect): Vec2[] {
  return [
    { x: r.x0, z: r.z0 },
    { x: r.x1, z: r.z0 },
    { x: r.x1, z: r.z1 },
    { x: r.x0, z: r.z1 },
  ];
}

export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(dist2(a, b));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpVec2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  z: lerp(a.z, b.z, t),
});

/** Signed area of a polygon (positive = CCW). */
export function polygonArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

export function polygonCentroid(poly: readonly Vec2[]): Vec2 {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const cross = p.x * q.z - q.x * p.z;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
    a += cross;
  }
  if (Math.abs(a) < 1e-6) {
    // Degenerate → average of vertices.
    let mx = 0;
    let mz = 0;
    for (const p of poly) {
      mx += p.x;
      mz += p.z;
    }
    const n = Math.max(1, poly.length);
    return { x: mx / n, z: mz / n };
  }
  a *= 3;
  return { x: cx / a, z: cz / a };
}

/** Ray-cast point-in-polygon test (X/Z plane). */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect =
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z + Number.EPSILON) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounds of a polygon. */
export function polygonBounds(poly: readonly Vec2[]): Rect {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.x > x1) x1 = p.x;
    if (p.z > z1) z1 = p.z;
  }
  return { x0, z0, x1, z1 };
}

/** Do two axis-aligned rectangles overlap (with an optional pad)? */
export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.z0 - pad < b.z1 && a.z1 + pad > b.z0;
}
