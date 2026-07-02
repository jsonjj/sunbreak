// physics/ragdoll — settle detection, pose classification, and the get-up / despawn decision.
//
// Get-up itself is KEYFRAMED (no motors): once a survivable ragdoll settles we classify how it's
// lying (front/back/side), hand the skeleton back to the Animation subsystem for a matching
// Mixamo get-up clip, and hold the bodies kinematic (following bones) so a fresh hit can instantly
// re-ragdoll. Clips are the Animation subsystem's deliverable — this module owns everything up to
// (and the seam of) that hand-off.

import * as THREE from "three";
import { SETTLE_ANGVEL, SETTLE_LINVEL } from "./config";
import type { BoneId, RapierNamespace, RigInstance } from "./types";

type BoneRefs = Partial<Record<BoneId, THREE.Bone>>;
export type LiePose = "front" | "back" | "side";

const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();

/** Peak linear / angular speed across a rig's bodies (m/s, rad/s). */
export function aggregateVelocity(rig: RigInstance): { lin: number; ang: number } {
  let lin = 0;
  let ang = 0;
  for (const id of Object.keys(rig.bodies) as BoneId[]) {
    const body = rig.bodies[id];
    if (!body) continue;
    const lv = body.linvel();
    const av = body.angvel();
    lin = Math.max(lin, Math.hypot(lv.x, lv.y, lv.z));
    ang = Math.max(ang, Math.hypot(av.x, av.y, av.z));
  }
  return { lin, ang };
}

/** True once every body has come (nearly) to rest. */
export function isResting(rig: RigInstance): boolean {
  const { lin, ang } = aggregateVelocity(rig);
  return lin < SETTLE_LINVEL && ang < SETTLE_ANGVEL;
}

/** True when Rapier has auto-slept the whole rig (cheapest settle signal). */
export function allAsleep(rig: RigInstance): boolean {
  for (const id of Object.keys(rig.bodies) as BoneId[]) {
    const body = rig.bodies[id];
    if (body && !body.isSleeping()) return false;
  }
  return true;
}

/**
 * Classify how the rig is lying from the pelvis orientation. Heuristic (tune per rig): if the
 * pelvis "up" axis is still fairly vertical it's on its side; otherwise the sign of the forward
 * axis' vertical component distinguishes face-down (front) from face-up (back).
 */
export function classifyFacing(rig: RigInstance): LiePose {
  const pelvis = rig.bodies[rig.spec.rootBone];
  if (!pelvis) return "back";
  const r = pelvis.rotation();
  _quat.set(r.x, r.y, r.z, r.w);
  _up.set(0, 1, 0).applyQuaternion(_quat);
  if (Math.abs(_up.y) > 0.6) return "side";
  _fwd.set(0, 0, 1).applyQuaternion(_quat);
  return _fwd.y < 0 ? "front" : "back";
}

/**
 * Switch a rig back to kinematic so it follows the (about-to-be-animated) bones during a get-up.
 * Call `driveKinematicFromBones` each step afterward.
 */
export function prepareGetUp(rapier: RapierNamespace, rig: RigInstance): void {
  for (const id of Object.keys(rig.bodies) as BoneId[]) {
    const body = rig.bodies[id];
    if (body) body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, false);
  }
}

/** Drive every body to follow its bone (used during get-up so a second hit can re-ragdoll). */
export function driveKinematicFromBones(rig: RigInstance, refs: BoneRefs): void {
  for (const b of rig.spec.bodies) {
    const body = rig.bodies[b.id];
    const bone = refs[b.id];
    if (!body || !bone) continue;
    bone.getWorldPosition(_pos);
    bone.getWorldQuaternion(_quat);
    body.setNextKinematicTranslation({ x: _pos.x, y: _pos.y, z: _pos.z });
    body.setNextKinematicRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w });
  }
}
