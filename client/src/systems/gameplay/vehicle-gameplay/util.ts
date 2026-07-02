// Tiny allocation-free math helpers used across the subsystem.
import * as THREE from "three";
import type { Quat, Vec3 } from "@sunbreak/shared";

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate-independent exponential approach toward `target`. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export const KMH_PER_MS = 3.6;
export const MPH_PER_KMH = 0.621371;

/** Monotonic seconds (wall clock is fine for gameplay timers). */
export const nowSec = (): number =>
  (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

/** Y-axis (yaw) quaternion as a plain serializable Quat. */
export const quatFromYaw = (yaw: number): Quat => ({
  x: 0,
  y: Math.sin(yaw * 0.5),
  z: 0,
  w: Math.cos(yaw * 0.5),
});

// Module scratch — reused so seat/exit math never allocates per call.
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Transform a body-local offset into world space given a position + rotation. */
export const localToWorld = (offset: Vec3, position: Vec3, rotation: Quat): Vec3 => {
  _q.set(rotation.x, rotation.y, rotation.z, rotation.w);
  _v.set(offset.x, offset.y, offset.z).applyQuaternion(_q);
  return { x: position.x + _v.x, y: position.y + _v.y, z: position.z + _v.z };
};

/** Planar (XZ) distance between two points. */
export const planarDist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
