// Builds a "rig template" entirely in code: a Group holding ONE shared canonical skeleton, a
// full-body skin mannequin (always visible), and one SkinnedMesh per wardrobe variant (hidden by
// default). This is structurally identical to a conformed Quaternius rig-template GLB — so the
// SAME CharacterFactory.build() path works whether the template is procedural or loaded from disk.
//
// Why procedural at all: the CC0 GLBs are vendored offline (see assetSources.ts). Until they're
// present, this fallback lets the whole pipeline — clone, tint, animate, switch — run FOR REAL.

import * as THREE from "three";
import type { BodyId, PaletteChannel, Slot } from "../types";
import { eachVariant, partName } from "../modular/wardrobe";
import { box, capsule, ellipsoid, mergeParts, sphere, taperedLimb } from "./geometryKit";
import { BONE, buildBones, buildSkeleton } from "./skeleton";

interface Proportion {
  limb: number;
  torso: number;
  head: number;
}

const BODY_PROPORTIONS: Readonly<Record<BodyId, Proportion>> = {
  slim: { limb: 0.86, torso: 0.9, head: 0.96 },
  medium: { limb: 1, torso: 1, head: 1 },
  heavy: { limb: 1.22, torso: 1.28, head: 1.05 },
};

/** Metadata stamped on each SkinnedMesh so the factory can toggle/tint after cloning. */
export interface PartUserData {
  base?: boolean;
  slot?: Slot;
  variant?: string;
  channel: PaletteChannel;
}

const PLACEHOLDER = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 });

// A single anatomically-shaped foot (heel pad + tapered sole + rounded toe), skinned to one ankle.
function foot(bone: typeof BONE.LFoot | typeof BONE.RFoot, L: number): THREE.BufferGeometry[] {
  return [
    // sole/instep: sits flat on the ground and runs forward from the ankle
    box(bone, [0.083 * L, 0.05 * L, 0.19], bone, { offset: [0, -0.045, -0.055] }),
    // rounded heel behind the ankle
    ellipsoid(bone, [0.042 * L, 0.03 * L, 0.045], bone, { offset: [0, -0.04, 0.025] }),
    // rounded toe box front
    ellipsoid(bone, [0.045 * L, 0.028 * L, 0.05], bone, { offset: [0, -0.05, -0.145] }),
  ];
}

// ── Full-body skin mesh (clothing shells layer on top of this) ───────────────────────────────────
// Real proportions: limbs taper toward their distal joints, the torso narrows at the waist, the
// head carries a jaw, and the hands/feet are shaped — so the base body reads as a person even nude,
// and clothing draped over it sits naturally.
function buildSkinBody(p: Proportion): THREE.BufferGeometry {
  const L = p.limb;
  const T = p.torso;
  const H = p.head;
  const parts: THREE.BufferGeometry[] = [
    // head: cranium ellipsoid + a jaw/cheek mass for a face-forward silhouette
    ellipsoid(BONE.Head, [0.089 * H, 0.108 * H, 0.096 * H], BONE.Head, { offset: [0, 0.05, 0] }),
    ellipsoid(BONE.Head, [0.07 * H, 0.06 * H, 0.082 * H], BONE.Head, { offset: [0, -0.012, 0.012] }),
    // neck taper into the skull
    taperedLimb(BONE.Neck, BONE.Head, 0.052 * H, 0.044 * H, BONE.Neck),
    // torso: chest (broad) → waist (narrow) → pelvis (flare)
    taperedLimb(BONE.Spine, BONE.Spine2, 0.118 * T, 0.146 * T, BONE.Spine1),
    taperedLimb(BONE.Hips, BONE.Spine, 0.138 * T, 0.118 * T, BONE.Hips),
    // deltoids bridge chest → arm
    ellipsoid(BONE.LArm, [0.063 * L, 0.06 * L, 0.063 * L], BONE.LArm, { offset: [0.01, 0.01, 0] }),
    ellipsoid(BONE.RArm, [0.063 * L, 0.06 * L, 0.063 * L], BONE.RArm, { offset: [-0.01, 0.01, 0] }),
    // arms: upper arm + forearm, each tapering to the joint below
    taperedLimb(BONE.LArm, BONE.LForeArm, 0.053 * L, 0.041 * L, BONE.LArm),
    taperedLimb(BONE.RArm, BONE.RForeArm, 0.053 * L, 0.041 * L, BONE.RArm),
    taperedLimb(BONE.LForeArm, BONE.LHand, 0.041 * L, 0.03 * L, BONE.LForeArm),
    taperedLimb(BONE.RForeArm, BONE.RHand, 0.041 * L, 0.03 * L, BONE.RForeArm),
    // hands: relaxed fists (rounded, slightly flattened)
    ellipsoid(BONE.LHand, [0.033 * L, 0.052 * L, 0.022 * L], BONE.LHand, { offset: [0, -0.045, 0] }),
    ellipsoid(BONE.RHand, [0.033 * L, 0.052 * L, 0.022 * L], BONE.RHand, { offset: [0, -0.045, 0] }),
    // legs: thigh + calf, tapering to knee / ankle
    taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.097 * L, 0.062 * L, BONE.LUpLeg),
    taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.097 * L, 0.062 * L, BONE.RUpLeg),
    taperedLimb(BONE.LLeg, BONE.LFoot, 0.063 * L, 0.038 * L, BONE.LLeg),
    taperedLimb(BONE.RLeg, BONE.RFoot, 0.063 * L, 0.038 * L, BONE.RLeg),
    // feet
    ...foot(BONE.LFoot, L),
    ...foot(BONE.RFoot, L),
  ];
  return mergeParts(parts);
}

// ── Wardrobe shells ─────────────────────────────────────────────────────────────────────────────
function sleeves(r: number): THREE.BufferGeometry[] {
  return [
    capsule(BONE.LArm, BONE.LForeArm, r, BONE.LArm),
    capsule(BONE.RArm, BONE.RForeArm, r, BONE.RArm),
    capsule(BONE.LForeArm, BONE.LHand, r * 0.9, BONE.LForeArm),
    capsule(BONE.RForeArm, BONE.RHand, r * 0.9, BONE.RForeArm),
  ];
}

// A shoe/boot shell that fully encloses the shaped foot (sole + rounded toe + heel). `riseExtra`
// thickens it for boots.
function shoe(
  bone: typeof BONE.LFoot | typeof BONE.RFoot,
  L: number,
  riseExtra = 0,
): THREE.BufferGeometry[] {
  const h = 0.066 + riseExtra;
  const offY = h / 2 - 0.074; // keep the sole ≈ on the ground regardless of thickness
  return [
    box(bone, [0.1 * L, h, 0.27], bone, { offset: [0, offY, -0.05] }),
    ellipsoid(bone, [0.05 * L, h * 0.5, 0.055], bone, { offset: [0, offY + 0.006, -0.15] }),
    ellipsoid(bone, [0.05 * L, h * 0.5, 0.05], bone, { offset: [0, offY + 0.01, 0.03] }),
  ];
}

function buildVariantGeometry(slot: Slot, id: string, p: Proportion): THREE.BufferGeometry | null {
  const T = p.torso;
  const L = p.limb;
  switch (id) {
    // torso ---------------------------------------------------------------------------------------
    case "torso_tee":
      return mergeParts([
        taperedLimb(BONE.Spine, BONE.Spine2, 0.128 * T, 0.156 * T, BONE.Spine1),
        taperedLimb(BONE.Hips, BONE.Spine, 0.132 * T, 0.128 * T, BONE.Hips),
        taperedLimb(BONE.LArm, BONE.LForeArm, 0.062 * L, 0.05 * L, BONE.LArm),
        taperedLimb(BONE.RArm, BONE.RForeArm, 0.062 * L, 0.05 * L, BONE.RArm),
      ]);
    case "torso_jacket":
      return mergeParts([
        taperedLimb(BONE.Spine, BONE.Spine2, 0.15 * T, 0.166 * T, BONE.Spine1),
        taperedLimb(BONE.Hips, BONE.Spine, 0.152 * T, 0.15 * T, BONE.Hips),
        ...sleeves(0.064 * L),
        sphere(BONE.Neck, 0.09 * p.head, BONE.Neck, { scale: [1.2, 0.6, 1.2], offset: [0, 0.02, 0] }),
      ]);
    case "torso_tank":
      return mergeParts([taperedLimb(BONE.Spine, BONE.Spine2, 0.128 * T, 0.154 * T, BONE.Spine1)]);
    // legs ----------------------------------------------------------------------------------------
    case "legs_pants":
      return mergeParts([
        taperedLimb(BONE.Hips, BONE.Spine, 0.146 * T, 0.126 * T, BONE.Hips),
        taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.106 * L, 0.072 * L, BONE.LUpLeg),
        taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.106 * L, 0.072 * L, BONE.RUpLeg),
        taperedLimb(BONE.LLeg, BONE.LFoot, 0.072 * L, 0.05 * L, BONE.LLeg),
        taperedLimb(BONE.RLeg, BONE.RFoot, 0.072 * L, 0.05 * L, BONE.RLeg),
      ]);
    case "legs_shorts":
      return mergeParts([
        taperedLimb(BONE.Hips, BONE.Spine, 0.146 * T, 0.126 * T, BONE.Hips),
        taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.108 * L, 0.086 * L, BONE.LUpLeg),
        taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.108 * L, 0.086 * L, BONE.RUpLeg),
      ]);
    case "legs_skirt":
      return mergeParts([
        capsule(BONE.Hips, BONE.Spine, 0.146 * T, BONE.Hips),
        box(BONE.Hips, [0.36, 0.34, 0.24], BONE.Hips, { offset: [0, -0.2, 0] }),
      ]);
    // feet ----------------------------------------------------------------------------------------
    case "feet_shoes":
      return mergeParts([
        ...shoe(BONE.LFoot, L),
        ...shoe(BONE.RFoot, L),
      ]);
    case "feet_boots":
      return mergeParts([
        ...shoe(BONE.LFoot, L, 0.02),
        ...shoe(BONE.RFoot, L, 0.02),
        capsule(BONE.LFoot, BONE.LLeg, 0.082 * L, BONE.LLeg, 1),
        capsule(BONE.RFoot, BONE.RLeg, 0.082 * L, BONE.RLeg, 1),
      ]);
    // hair ----------------------------------------------------------------------------------------
    case "hair_short":
      return sphere(BONE.Head, 0.125 * p.head, BONE.Head, {
        scale: [1.05, 0.9, 1.05],
        offset: [0, 0.07, 0],
      });
    case "hair_long":
      return mergeParts([
        sphere(BONE.Head, 0.126 * p.head, BONE.Head, { scale: [1.05, 0.95, 1.05], offset: [0, 0.06, 0] }),
        box(BONE.Head, [0.22, 0.3, 0.13], BONE.Head, { offset: [0, -0.06, 0.06] }),
      ]);
    case "hair_bun":
      return mergeParts([
        sphere(BONE.Head, 0.122 * p.head, BONE.Head, { scale: [1.04, 0.86, 1.04], offset: [0, 0.06, 0] }),
        sphere(BONE.Head, 0.06 * p.head, BONE.Head, { offset: [0, 0.18, -0.02] }),
      ]);
    // hat -----------------------------------------------------------------------------------------
    case "hat_cap":
      return mergeParts([
        sphere(BONE.Head, 0.128 * p.head, BONE.Head, { scale: [1.05, 0.62, 1.05], offset: [0, 0.11, 0] }),
        box(BONE.Head, [0.24, 0.03, 0.15], BONE.Head, { offset: [0, 0.08, -0.13] }),
      ]);
    // accessory -----------------------------------------------------------------------------------
    case "acc_sling":
      return box(BONE.Spine1, [0.09, 0.34, 0.09], BONE.Spine1, { offset: [0.11, -0.02, 0.03] });
    default:
      return null;
  }
}

function addSkinnedMesh(
  root: THREE.Object3D,
  skeleton: THREE.Skeleton,
  name: string,
  geometry: THREE.BufferGeometry,
  userData: PartUserData,
  visible: boolean,
): void {
  const mesh = new THREE.SkinnedMesh(geometry, PLACEHOLDER);
  mesh.name = name;
  mesh.userData = userData;
  mesh.visible = visible;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  // Bones move the mesh; a static bounding sphere would cull it incorrectly.
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
}

/** Build a fresh procedural rig template for a body proportion. */
export function buildProceduralTemplate(bodyId: BodyId): THREE.Object3D {
  const p = BODY_PROPORTIONS[bodyId] ?? BODY_PROPORTIONS.medium;
  const bones = buildBones();
  const skeleton = buildSkeleton(bones);
  const root = new THREE.Group();
  root.name = `char:template:${bodyId}`;
  const hips = bones[0];
  if (hips) root.add(hips);

  addSkinnedMesh(root, skeleton, "base::skin", buildSkinBody(p), { base: true, channel: "skin" }, true);

  for (const { slot, variant } of eachVariant()) {
    const geo = buildVariantGeometry(slot, variant.id, p);
    if (!geo) continue;
    addSkinnedMesh(
      root,
      skeleton,
      partName(slot, variant.id),
      geo,
      { slot, variant: variant.id, channel: variant.channel },
      false,
    );
  }

  root.updateMatrixWorld(true);
  return root;
}

const templateCache = new Map<BodyId, THREE.Object3D>();

/** Get a cached procedural template (built once per proportion, cloned per character). */
export function getProceduralTemplate(bodyId: BodyId): THREE.Object3D {
  let tpl = templateCache.get(bodyId);
  if (!tpl) {
    tpl = buildProceduralTemplate(bodyId);
    templateCache.set(bodyId, tpl);
  }
  return tpl;
}
