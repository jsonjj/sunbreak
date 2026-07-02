// Plain, non-networked math types. Serializable POJOs shared by client + server.

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export interface Transform {
  position: Vec3;
  rotation: Quat;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => ({ x, y, z, w });

export const vec3ToArray = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z];
export const vec3FromArray = (a: Vec3Tuple): Vec3 => ({ x: a[0], y: a[1], z: a[2] });
export const quatToArray = (q: Quat): QuatTuple => [q.x, q.y, q.z, q.w];
export const quatFromArray = (a: QuatTuple): Quat => ({ x: a[0], y: a[1], z: a[2], w: a[3] });

export const identityTransform = (): Transform => ({
  position: vec3(),
  rotation: quat(),
});

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
