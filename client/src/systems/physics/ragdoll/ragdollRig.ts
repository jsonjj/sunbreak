// physics/ragdoll — RIG specs: bone→body map, capsule dims, mass table, and joint table.
//
// Bone names follow the Mixamo convention ("mixamorig*") so one rig covers every Mixamo/auto-
// rigged character the Animation subsystem loads. Capsule dims + masses approximate a ~75kg
// adult; joint anchors are expressed in each body's local space (Y is "up" the bone).

import type { BoneId, RigBody, RigJoint, RigSpec, RagdollTier } from "./types";

/** Mixamo bone that each logical body drives. */
export const BONE_NAMES: Record<BoneId, string> = {
  pelvis: "mixamorigHips",
  chest: "mixamorigSpine2",
  head: "mixamorigHead",
  armL: "mixamorigLeftArm",
  foreL: "mixamorigLeftForeArm",
  armR: "mixamorigRightArm",
  foreR: "mixamorigRightForeArm",
  thighL: "mixamorigLeftUpLeg",
  shinL: "mixamorigLeftLeg",
  thighR: "mixamorigRightUpLeg",
  shinR: "mixamorigRightLeg",
};

const B = (id: BoneId, half: number, radius: number, mass: number): RigBody => ({
  id,
  bone: BONE_NAMES[id],
  half,
  radius,
  mass,
});

// Full 11-body humanoid (~75kg total). Pelvis + chest carry most mass.
const FULL_BODIES: RigBody[] = [
  B("pelvis", 0.08, 0.14, 14),
  B("chest", 0.14, 0.14, 20),
  B("head", 0.07, 0.1, 5),
  B("armL", 0.13, 0.05, 2.8),
  B("foreL", 0.12, 0.045, 2.0),
  B("armR", 0.13, 0.05, 2.8),
  B("foreR", 0.12, 0.045, 2.0),
  B("thighL", 0.2, 0.08, 9),
  B("shinL", 0.19, 0.06, 4.2),
  B("thighR", 0.2, 0.08, 9),
  B("shinR", 0.19, 0.06, 4.2),
];

// Elbows/knees are hinges (revolute) with a one-way limit; everything else is a ball (spherical).
const ELBOW_LIMITS: [number, number] = [-2.3, 0];
const KNEE_LIMITS: [number, number] = [0, 2.3];

const FULL_JOINTS: RigJoint[] = [
  { a: "pelvis", b: "chest", type: "spherical", anchorA: [0, 0.1, 0], anchorB: [0, -0.14, 0] },
  { a: "chest", b: "head", type: "spherical", anchorA: [0, 0.16, 0], anchorB: [0, -0.09, 0] },
  { a: "chest", b: "armL", type: "spherical", anchorA: [-0.17, 0.12, 0], anchorB: [0, 0.13, 0] },
  { a: "armL", b: "foreL", type: "revolute", anchorA: [0, -0.13, 0], anchorB: [0, 0.12, 0], axis: [1, 0, 0], limits: ELBOW_LIMITS },
  { a: "chest", b: "armR", type: "spherical", anchorA: [0.17, 0.12, 0], anchorB: [0, 0.13, 0] },
  { a: "armR", b: "foreR", type: "revolute", anchorA: [0, -0.13, 0], anchorB: [0, 0.12, 0], axis: [1, 0, 0], limits: ELBOW_LIMITS },
  { a: "pelvis", b: "thighL", type: "spherical", anchorA: [-0.09, -0.08, 0], anchorB: [0, 0.2, 0] },
  { a: "thighL", b: "shinL", type: "revolute", anchorA: [0, -0.2, 0], anchorB: [0, 0.19, 0], axis: [1, 0, 0], limits: KNEE_LIMITS },
  { a: "pelvis", b: "thighR", type: "spherical", anchorA: [0.09, -0.08, 0], anchorB: [0, 0.2, 0] },
  { a: "thighR", b: "shinR", type: "revolute", anchorA: [0, -0.2, 0], anchorB: [0, 0.19, 0], axis: [1, 0, 0], limits: KNEE_LIMITS },
];

// Parent-before-child order for top-down bone sync (root "pelvis" handled separately).
const FULL_CHILD_ORDER: BoneId[] = [
  "chest",
  "head",
  "armL",
  "foreL",
  "armR",
  "foreR",
  "thighL",
  "shinL",
  "thighR",
  "shinR",
];

// Reduced 6-body rig (Tier1, 15–35m): single spine, whole-limb capsules, no elbows/knees.
// armL/armR drive the upper-arm bone but are sized to span the whole arm; likewise legs.
const REDUCED_BODIES: RigBody[] = [
  B("pelvis", 0.1, 0.14, 16),
  B("chest", 0.16, 0.14, 24),
  B("armL", 0.22, 0.055, 4.5),
  B("armR", 0.22, 0.055, 4.5),
  B("thighL", 0.34, 0.08, 13),
  B("thighR", 0.34, 0.08, 13),
];

const REDUCED_JOINTS: RigJoint[] = [
  { a: "pelvis", b: "chest", type: "spherical", anchorA: [0, 0.1, 0], anchorB: [0, -0.16, 0] },
  { a: "chest", b: "armL", type: "spherical", anchorA: [-0.18, 0.14, 0], anchorB: [0, 0.22, 0] },
  { a: "chest", b: "armR", type: "spherical", anchorA: [0.18, 0.14, 0], anchorB: [0, 0.22, 0] },
  { a: "pelvis", b: "thighL", type: "spherical", anchorA: [-0.09, -0.1, 0], anchorB: [0, 0.34, 0] },
  { a: "pelvis", b: "thighR", type: "spherical", anchorA: [0.09, -0.1, 0], anchorB: [0, 0.34, 0] },
];

const REDUCED_CHILD_ORDER: BoneId[] = ["chest", "armL", "armR", "thighL", "thighR"];

// Tier2: a single body-sized capsule that just flops. No joints, no bone sync required — it can
// even drive a plain mesh (v0 capsule) via the entity root. This is the over-cap / far-LOD path.
const SINGLE_BODIES: RigBody[] = [B("pelvis", 0.5, 0.28, 75)];

const SPECS: Record<RagdollTier, RigSpec> = {
  0: { tier: 0, rootBone: "pelvis", bodies: FULL_BODIES, joints: FULL_JOINTS, childOrder: FULL_CHILD_ORDER },
  1: { tier: 1, rootBone: "pelvis", bodies: REDUCED_BODIES, joints: REDUCED_JOINTS, childOrder: REDUCED_CHILD_ORDER },
  2: { tier: 2, rootBone: "pelvis", bodies: SINGLE_BODIES, joints: [], childOrder: [] },
};

export function getRig(tier: RagdollTier): RigSpec {
  return SPECS[tier];
}
