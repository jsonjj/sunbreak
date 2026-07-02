// Tiny scalar/geometry helpers + module-level scratch so the hot path never allocates.
// (We keep our own plain {x,y,z} scratch rather than THREE.Vector3 to stay usable headless.)

export interface XZ {
  x: number;
  z: number;
}
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export const scratchA: XYZ = { x: 0, y: 0, z: 0 };
export const scratchB: XYZ = { x: 0, y: 0, z: 0 };

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const dist2XZ = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

/** Shortest signed angular difference a→b in radians (result in (-π, π]). */
export const angleDelta = (a: number, b: number): number => {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d;
};

/** Yaw of a planar direction so that a +Z-forward model faces (dx, dz). */
export const yawFromDir = (dx: number, dz: number): number => Math.atan2(dx, dz);

/** Set a quaternion (x,y,z,w) from a yaw about +Y. */
export const setYawQuat = (
  out: { x: number; y: number; z: number; w: number },
  yaw: number,
): void => {
  const h = yaw * 0.5;
  out.x = 0;
  out.y = Math.sin(h);
  out.z = 0;
  out.w = Math.cos(h);
};
