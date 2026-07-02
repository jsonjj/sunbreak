import type { Quat } from "@sunbreak/shared";

/** Y-up yaw (radians) extracted from a quaternion — used to rotate the radar. */
export function yawFromQuat(q: Quat): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}
