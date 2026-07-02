// Pure 2D map math — clamps, damping, distances, ring-clamp + compass helpers. No engine deps.
import type { Vec2 } from "./types";

export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate-independent exponential smoothing (same feel as THREE.MathUtils.damp). */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const dist = (ax: number, az: number, bx: number, bz: number): number =>
  Math.sqrt(dist2(ax, az, bx, bz));

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

/** Nearest distance (m) from a point to a polyline; Infinity for an empty/one-point path. */
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

/** Even-odd ray-cast point-in-polygon (used for the "current district" readout). */
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

export interface RingClamp {
  x: number;
  y: number;
  clamped: boolean;
  angle: number;
}

/** Clamp an offset (dx,dy from centre) to a ring of `radius`, leaving `margin` px inside. */
export function clampToRing(dx: number, dy: number, radius: number, margin: number): RingClamp {
  const d = Math.hypot(dx, dy);
  const limit = radius - margin;
  const angle = Math.atan2(dy, dx);
  if (d <= limit || d < 1e-3) return { x: dx, y: dy, clamped: false, angle };
  const s = limit / d;
  return { x: dx * s, y: dy * s, clamped: true, angle };
}

/** Compass bearing (radians, 0 = north/up, clockwise) for a world delta. */
export const bearingOf = (dx: number, dz: number): number => Math.atan2(dx, -dz);

/** Screen angle (rad, 0 = +x) that points north given map rotation `theta` (0 = north-up). */
export const northScreenAngle = (theta: number): number =>
  Math.atan2(-Math.cos(theta), Math.sin(theta));

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8-point compass word for a bearing (accessibility readout). */
export function compassWord(bearingRad: number): string {
  const idx = Math.round(((bearingRad % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
  return COMPASS[idx]!;
}

/** Human distance: `120 m` / `1.4 km`. */
export function formatDistance(m: number): string {
  if (!isFinite(m)) return "—";
  return m < 950 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Rough driving ETA from a route distance (~32 km/h city average). */
export function formatEta(distanceM: number): string {
  const secs = distanceM / 9;
  if (!isFinite(secs)) return "—";
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
