// Small, allocation-conscious helpers shared across the mission runtime.

import type { Quat, Vec3 as SharedVec3 } from "@sunbreak/shared";
import type { Vec3 } from "./schema";

export const identityQuat = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

export const tupleToVec3 = (t: Vec3): SharedVec3 => ({ x: t[0], y: t[1], z: t[2] });
export const vec3ToTuple = (v: SharedVec3): Vec3 => [v.x, v.y, v.z];

/** Squared planar (X/Z ground-plane) distance — cheap, no sqrt, forgiving of Y. */
export function distSqXZ(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.sqrt(distSqXZ(a, b));
}

export function withinXZ(a: Vec3, b: Vec3, radius: number): boolean {
  return distSqXZ(a, b) <= radius * radius;
}

/** Scatter a point inside a disc of `radius` on the X/Z plane (keeps Y). */
export function jitter(t: Vec3, radius: number): Vec3 {
  if (!radius) return [t[0], t[1], t[2]];
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.sqrt(Math.random()) * radius;
  return [t[0] + Math.cos(angle) * dist, t[1], t[2] + Math.sin(angle) * dist];
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
