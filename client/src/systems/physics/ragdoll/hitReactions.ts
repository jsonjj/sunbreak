// physics/ragdoll — hit reactions for LIVING characters.
//
// Three tiers, cheapest first:
//   • flinch  → additive Mixamo hit-react clip over locomotion (no physics). Covers ~80% of hits.
//   • stagger → "powered"/partial ragdoll: only the struck limb goes dynamic; the rest stays
//               animation-kinematic (bodies follow bones each step), recombining after a beat.
//   • knockdown/death → full activation (handled by the director → passive ragdoll).

import * as THREE from "three";
import type { BoneId, HitReactionParams, RapierNamespace, RigInstance } from "./types";
import { applyImpulse } from "./activate";

type BoneRefs = Partial<Record<BoneId, THREE.Bone>>;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/** Which limb a struck bone belongs to (for powered/partial reactions). */
export type Limb = "armL" | "armR" | "legL" | "legR";
export const LIMB_GROUPS: Record<Limb, BoneId[]> = {
  armL: ["armL", "foreL"],
  armR: ["armR", "foreR"],
  legL: ["thighL", "shinL"],
  legR: ["thighR", "shinR"],
};

export function limbForBone(bone: BoneId): Limb | null {
  for (const limb of Object.keys(LIMB_GROUPS) as Limb[]) {
    if (LIMB_GROUPS[limb].includes(bone)) return limb;
  }
  return null;
}

/** Route a hit severity to a reaction strategy. */
export function classifyReaction(type: HitReactionParams["type"]): "additive" | "powered" | "ragdoll" {
  switch (type) {
    case "flinch":
      return "additive";
    case "stagger":
      return "powered";
    case "knockdown":
    case "death":
    default:
      return "ragdoll";
  }
}

/**
 * Additive flinch seam. The Animation subsystem owns the actual Mixamo hit-react clips; when it
 * exposes them (e.g. on `entity.mixer` via drei useAnimations) this plays one. Returns false when
 * no clip is available so the caller can fall back. Kept dependency-free of the animation module.
 */
export function playAdditiveReaction(_mixer: THREE.AnimationMixer | undefined): boolean {
  // No clip registry is reachable from a bare AnimationMixer; the integrator wires the
  // Animation subsystem's `playReaction(entity, clip)` here. Until then this is a no-op.
  return false;
}

/**
 * Begin a powered/partial reaction: enable the whole rig, make ONLY the struck limb dynamic
 * (seeded from its bones + hit impulse), and hold the rest as kinematic followers of the anim
 * pose. Requires resolved bones (skinned mesh).
 */
export function beginPoweredLimb(
  rapier: RapierNamespace,
  rig: RigInstance,
  refs: BoneRefs,
  limb: Limb,
  hit: HitReactionParams,
): void {
  rig.inUse = true;
  const limbSet = new Set<BoneId>(LIMB_GROUPS[limb]);
  for (const b of rig.spec.bodies) {
    const body = rig.bodies[b.id];
    const bone = refs[b.id];
    if (!body || !bone) continue;
    body.setEnabled(true);
    bone.getWorldPosition(_pos);
    bone.getWorldQuaternion(_quat);
    body.setTranslation({ x: _pos.x, y: _pos.y, z: _pos.z }, false);
    body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, false);
    if (limbSet.has(b.id)) {
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    } else {
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, false);
    }
  }
  applyImpulse(rig, hit);
}

/** Per-step (before physics): drive the non-limb kinematic bodies to follow the current anim pose. */
export function drivePoweredLimb(rig: RigInstance, refs: BoneRefs, limb: Limb): void {
  const limbSet = new Set<BoneId>(LIMB_GROUPS[limb]);
  for (const b of rig.spec.bodies) {
    if (limbSet.has(b.id)) continue;
    const body = rig.bodies[b.id];
    const bone = refs[b.id];
    if (!body || !bone) continue;
    bone.getWorldPosition(_pos);
    bone.getWorldQuaternion(_quat);
    body.setNextKinematicTranslation({ x: _pos.x, y: _pos.y, z: _pos.z });
    body.setNextKinematicRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w });
  }
}

/** Which bones to write back from physics during a powered reaction (only the dynamic limb). */
export function poweredLimbSyncBones(limb: Limb): BoneId[] {
  return LIMB_GROUPS[limb];
}
