// Small shared helpers. Proximity is evaluated on the X/Z ground plane (Y ignored) which is the
// right model for on-foot + vehicle gameplay and avoids false negatives from ride height.

import type { Vec3, Vec3Tuple } from "@sunbreak/shared";

export const planarDist2 = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

export const withinPlanar = (a: Vec3, b: Vec3, radius: number): boolean =>
  planarDist2(a, b) <= radius * radius;

export const tupleToVec3 = (t: Vec3Tuple): Vec3 => ({ x: t[0], y: t[1], z: t[2] });

export const fmtTime = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};
