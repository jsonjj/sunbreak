// Line-of-sight, sight-cone and hearing primitives. LOS uses ONE reused Rapier ray (zero
// alloc) and excludes dynamic bodies so only static world geometry occludes the view — exactly
// the spec's approach. When no Rapier context is injected (view not mounted / Low quality) LOS
// returns true and detection falls back to FOV + distance only (the documented Low fallback).
import type { RapierCtx } from "./rapierBridge";
import { getRapierCtx } from "./rapierBridge";

type RapierRay = InstanceType<RapierCtx["rapier"]["Ray"]>;

let ray: RapierRay | null = null;
let rayModule: unknown = null;
const scratchOrigin = { x: 0, y: 0, z: 0 };
const scratchDir = { x: 0, y: 0, z: 0 };

/** True if nothing static blocks the segment eye→target (or if Rapier isn't available). */
export function hasLineOfSight(
  ex: number,
  ey: number,
  ez: number,
  tx: number,
  ty: number,
  tz: number,
): boolean {
  const ctx = getRapierCtx();
  if (!ctx) return true; // graceful fallback: FOV + distance only

  const dx = tx - ex;
  const dy = ty - ey;
  const dz = tz - ez;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;

  const { world, rapier } = ctx;
  if (rayModule !== rapier || ray == null) {
    ray = new rapier.Ray(scratchOrigin, scratchDir);
    rayModule = rapier;
  }
  scratchOrigin.x = ex;
  scratchOrigin.y = ey;
  scratchOrigin.z = ez;
  scratchDir.x = dx / dist;
  scratchDir.y = dy / dist;
  scratchDir.z = dz / dist;
  ray.origin = scratchOrigin;
  ray.dir = scratchDir;

  const hit = world.castRay(ray, dist, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
  // Clear view unless a static collider sits clearly in front of the target.
  return hit == null || hit.timeOfImpact >= dist - 0.75;
}

/** Squared planar distance (XZ). */
export function planarDist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * True if `target` sits inside the unit's sight cone: within `range` and within `fovDeg`/2 of
 * the unit's `facing`. `facing` uses the project convention forward = (-sin, -cos).
 */
export function inSightCone(
  ux: number,
  uz: number,
  facing: number,
  fovDeg: number,
  range: number,
  tx: number,
  tz: number,
): boolean {
  const dx = tx - ux;
  const dz = tz - uz;
  const d2 = dx * dx + dz * dz;
  if (d2 > range * range) return false;
  if (d2 < 1e-6) return true;
  const inv = 1 / Math.sqrt(d2);
  const ndx = dx * inv;
  const ndz = dz * inv;
  const fx = -Math.sin(facing);
  const fz = -Math.cos(facing);
  const dot = fx * ndx + fz * ndz;
  return dot >= Math.cos((fovDeg * 0.5 * Math.PI) / 180);
}

/** True if a sound at `sx,sz` of radius `radius` reaches the listener at `lx,lz`. */
export function heard(sx: number, sz: number, lx: number, lz: number, radius: number): boolean {
  return planarDist2(sx, sz, lx, lz) <= radius * radius;
}
