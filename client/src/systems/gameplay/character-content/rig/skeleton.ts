// The ONE canonical skeleton every biped in the game shares.
//
// Bone names are the *sanitized* Mixamo names (`mixamorigHips`, not `mixamorig:Hips`). This is
// deliberate and important: three's GLTFLoader runs `PropertyBinding.sanitizeNodeName()` on every
// node, which strips the reserved ':' — so a conformed Quaternius/Mixamo GLB ends up with EXACTLY
// these names at runtime. Authoring our procedural rig + clips against the sanitized names means
// the same shared AnimationClips bind to procedural bodies AND imported CC0 GLBs with zero retarget.

import * as THREE from "three";

/** Ergonomic references to the canonical bones. */
export const BONE = {
  Hips: "mixamorigHips",
  Spine: "mixamorigSpine",
  Spine1: "mixamorigSpine1",
  Spine2: "mixamorigSpine2",
  Neck: "mixamorigNeck",
  Head: "mixamorigHead",
  LShoulder: "mixamorigLeftShoulder",
  LArm: "mixamorigLeftArm",
  LForeArm: "mixamorigLeftForeArm",
  LHand: "mixamorigLeftHand",
  RShoulder: "mixamorigRightShoulder",
  RArm: "mixamorigRightArm",
  RForeArm: "mixamorigRightForeArm",
  RHand: "mixamorigRightHand",
  LUpLeg: "mixamorigLeftUpLeg",
  LLeg: "mixamorigLeftLeg",
  LFoot: "mixamorigLeftFoot",
  LToe: "mixamorigLeftToeBase",
  RUpLeg: "mixamorigRightUpLeg",
  RLeg: "mixamorigRightLeg",
  RFoot: "mixamorigRightFoot",
  RToe: "mixamorigRightToeBase",
} as const;

export type BoneName = (typeof BONE)[keyof typeof BONE];

interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** Local rest offset from parent, meters. Rest rotations are identity (T/A-pose). */
  pos: readonly [number, number, number];
}

// Ordered root -> leaves so bone index === array index and parents build before children.
// Rest pose: feet on the ground (y=0), ~1.75m tall, facing -Z, arms hanging slightly out.
export const BONE_DEFS: readonly BoneDef[] = [
  { name: BONE.Hips, parent: null, pos: [0, 0.98, 0] },
  { name: BONE.Spine, parent: BONE.Hips, pos: [0, 0.1, 0] },
  { name: BONE.Spine1, parent: BONE.Spine, pos: [0, 0.13, 0] },
  { name: BONE.Spine2, parent: BONE.Spine1, pos: [0, 0.13, 0] },
  { name: BONE.Neck, parent: BONE.Spine2, pos: [0, 0.1, 0] },
  { name: BONE.Head, parent: BONE.Neck, pos: [0, 0.11, 0] },

  { name: BONE.LShoulder, parent: BONE.Spine2, pos: [0.05, 0.08, 0] },
  { name: BONE.LArm, parent: BONE.LShoulder, pos: [0.12, -0.03, 0] },
  { name: BONE.LForeArm, parent: BONE.LArm, pos: [0, -0.27, 0] },
  { name: BONE.LHand, parent: BONE.LForeArm, pos: [0, -0.25, 0] },

  { name: BONE.RShoulder, parent: BONE.Spine2, pos: [-0.05, 0.08, 0] },
  { name: BONE.RArm, parent: BONE.RShoulder, pos: [-0.12, -0.03, 0] },
  { name: BONE.RForeArm, parent: BONE.RArm, pos: [0, -0.27, 0] },
  { name: BONE.RHand, parent: BONE.RForeArm, pos: [0, -0.25, 0] },

  { name: BONE.LUpLeg, parent: BONE.Hips, pos: [0.1, -0.07, 0] },
  { name: BONE.LLeg, parent: BONE.LUpLeg, pos: [0, -0.42, 0] },
  { name: BONE.LFoot, parent: BONE.LLeg, pos: [0, -0.41, 0] },
  { name: BONE.LToe, parent: BONE.LFoot, pos: [0, -0.06, -0.12] },

  { name: BONE.RUpLeg, parent: BONE.Hips, pos: [-0.1, -0.07, 0] },
  { name: BONE.RLeg, parent: BONE.RUpLeg, pos: [0, -0.42, 0] },
  { name: BONE.RFoot, parent: BONE.RLeg, pos: [0, -0.41, 0] },
  { name: BONE.RToe, parent: BONE.RFoot, pos: [0, -0.06, -0.12] },
];

export const BONE_NAMES: readonly BoneName[] = BONE_DEFS.map((b) => b.name);

/** name -> index into the bones array (== skinIndex used by geometry). */
export const BONE_INDEX: Readonly<Record<BoneName, number>> = (() => {
  const m: Partial<Record<BoneName, number>> = {};
  BONE_DEFS.forEach((b, i) => (m[b.name] = i));
  return m as Record<BoneName, number>;
})();

// Analytic rest world positions (rest rotations are identity, so world = sum of local offsets).
const REST_WORLD: Readonly<Record<BoneName, THREE.Vector3>> = (() => {
  const m = new Map<BoneName, THREE.Vector3>();
  for (const def of BONE_DEFS) {
    const local = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]);
    const world = def.parent ? m.get(def.parent)!.clone().add(local) : local;
    m.set(def.name, world);
  }
  const out: Partial<Record<BoneName, THREE.Vector3>> = {};
  for (const [k, v] of m) out[k] = v;
  return out as Record<BoneName, THREE.Vector3>;
})();

/** Rest-pose world position of a bone (fresh clone; safe to mutate). */
export function restWorld(name: BoneName): THREE.Vector3 {
  return REST_WORLD[name].clone();
}

/** Anchor bone for attaching a wardrobe/prop item in a slot. */
export const SLOT_ANCHORS: Readonly<Record<string, BoneName>> = {
  hair: BONE.Head,
  hat: BONE.Head,
  torso: BONE.Spine2,
  legs: BONE.Hips,
  feet: BONE.LFoot,
  accessory: BONE.Spine1,
};

/** Build the canonical bone hierarchy (fresh instances). Returns bones in BONE_DEFS order. */
export function buildBones(): THREE.Bone[] {
  const byName = new Map<BoneName, THREE.Bone>();
  const bones: THREE.Bone[] = [];
  for (const def of BONE_DEFS) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    bone.position.set(def.pos[0], def.pos[1], def.pos[2]);
    if (def.parent) byName.get(def.parent)!.add(bone);
    byName.set(def.name, bone);
    bones.push(bone);
  }
  return bones;
}

/** Build a Skeleton from bones, computing rest-pose inverses. Bones must already have offsets. */
export function buildSkeleton(bones: THREE.Bone[]): THREE.Skeleton {
  const root = bones[0];
  if (root) root.updateMatrixWorld(true);
  return new THREE.Skeleton(bones);
}

/** Dev-only: warn if a loaded/cloned rig is missing canonical bones (shared clips would fail). */
export function assertBoneParity(root: THREE.Object3D): boolean {
  const present = new Set<string>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) present.add(o.name);
  });
  const missing = BONE_NAMES.filter((n) => !present.has(n));
  if (missing.length > 0 && import.meta.env?.DEV) {
    console.warn("[character-content] rig missing canonical bones:", missing.join(", "));
  }
  return missing.length === 0;
}
