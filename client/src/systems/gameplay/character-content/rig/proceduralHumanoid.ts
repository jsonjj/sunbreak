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
import { box, capsule, mergeParts, sphere } from "./geometryKit";
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

// ── Full-body skin mannequin (clothing shells layer on top of this) ─────────────────────────────
function buildSkinBody(p: Proportion): THREE.BufferGeometry {
  const L = p.limb;
  const parts: THREE.BufferGeometry[] = [
    // head + neck
    sphere(BONE.Head, 0.115 * p.head, BONE.Head, { scale: [1, 1.12, 1.05], offset: [0, 0.04, 0] }),
    capsule(BONE.Neck, BONE.Head, 0.05 * p.head, BONE.Neck),
    // torso core + pelvis
    capsule(BONE.Spine, BONE.Spine2, 0.132 * p.torso, BONE.Spine1),
    capsule(BONE.Hips, BONE.Spine, 0.12 * p.torso, BONE.Hips),
    // shoulders (bridge the gap between chest and arms)
    sphere(BONE.LArm, 0.07 * L, BONE.LShoulder),
    sphere(BONE.RArm, 0.07 * L, BONE.RShoulder),
    // arms
    capsule(BONE.LArm, BONE.LForeArm, 0.05 * L, BONE.LArm),
    capsule(BONE.RArm, BONE.RForeArm, 0.05 * L, BONE.RArm),
    capsule(BONE.LForeArm, BONE.LHand, 0.045 * L, BONE.LForeArm),
    capsule(BONE.RForeArm, BONE.RHand, 0.045 * L, BONE.RForeArm),
    box(BONE.LHand, [0.06, 0.1, 0.045], BONE.LHand, { offset: [0, -0.04, 0] }),
    box(BONE.RHand, [0.06, 0.1, 0.045], BONE.RHand, { offset: [0, -0.04, 0] }),
    // legs
    capsule(BONE.LUpLeg, BONE.LLeg, 0.085 * L, BONE.LUpLeg),
    capsule(BONE.RUpLeg, BONE.RLeg, 0.085 * L, BONE.RUpLeg),
    capsule(BONE.LLeg, BONE.LFoot, 0.065 * L, BONE.LLeg),
    capsule(BONE.RLeg, BONE.RFoot, 0.065 * L, BONE.RLeg),
    box(BONE.LFoot, [0.09, 0.06, 0.2], BONE.LFoot, { offset: [0, -0.02, -0.05] }),
    box(BONE.RFoot, [0.09, 0.06, 0.2], BONE.RFoot, { offset: [0, -0.02, -0.05] }),
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

function buildVariantGeometry(slot: Slot, id: string, p: Proportion): THREE.BufferGeometry | null {
  const T = p.torso;
  const L = p.limb;
  switch (id) {
    // torso ---------------------------------------------------------------------------------------
    case "torso_tee":
      return mergeParts([
        capsule(BONE.Spine, BONE.Spine2, 0.148 * T, BONE.Spine1),
        capsule(BONE.LArm, BONE.LForeArm, 0.06 * L, BONE.LArm),
        capsule(BONE.RArm, BONE.RForeArm, 0.06 * L, BONE.RArm),
      ]);
    case "torso_jacket":
      return mergeParts([
        capsule(BONE.Spine, BONE.Spine2, 0.164 * T, BONE.Spine1),
        capsule(BONE.Hips, BONE.Spine, 0.14 * T, BONE.Hips),
        ...sleeves(0.062 * L),
        sphere(BONE.Neck, 0.09 * p.head, BONE.Neck, { scale: [1.2, 0.6, 1.2], offset: [0, 0.02, 0] }),
      ]);
    case "torso_tank":
      return mergeParts([capsule(BONE.Spine, BONE.Spine2, 0.146 * T, BONE.Spine1)]);
    // legs ----------------------------------------------------------------------------------------
    case "legs_pants":
      return mergeParts([
        capsule(BONE.Hips, BONE.Spine, 0.132 * T, BONE.Hips),
        capsule(BONE.LUpLeg, BONE.LLeg, 0.094 * L, BONE.LUpLeg),
        capsule(BONE.RUpLeg, BONE.RLeg, 0.094 * L, BONE.RUpLeg),
        capsule(BONE.LLeg, BONE.LFoot, 0.074 * L, BONE.LLeg),
        capsule(BONE.RLeg, BONE.RFoot, 0.074 * L, BONE.RLeg),
      ]);
    case "legs_shorts":
      return mergeParts([
        capsule(BONE.Hips, BONE.Spine, 0.134 * T, BONE.Hips),
        capsule(BONE.LUpLeg, BONE.LLeg, 0.096 * L, BONE.LUpLeg, 1),
        capsule(BONE.RUpLeg, BONE.RLeg, 0.096 * L, BONE.RUpLeg, 1),
      ]);
    case "legs_skirt":
      return mergeParts([
        capsule(BONE.Hips, BONE.Spine, 0.134 * T, BONE.Hips),
        box(BONE.Hips, [0.36, 0.34, 0.24], BONE.Hips, { offset: [0, -0.2, 0] }),
      ]);
    // feet ----------------------------------------------------------------------------------------
    case "feet_shoes":
      return mergeParts([
        box(BONE.LFoot, [0.1, 0.07, 0.23], BONE.LFoot, { offset: [0, -0.03, -0.06] }),
        box(BONE.RFoot, [0.1, 0.07, 0.23], BONE.RFoot, { offset: [0, -0.03, -0.06] }),
      ]);
    case "feet_boots":
      return mergeParts([
        box(BONE.LFoot, [0.1, 0.1, 0.23], BONE.LFoot, { offset: [0, -0.01, -0.06] }),
        box(BONE.RFoot, [0.1, 0.1, 0.23], BONE.RFoot, { offset: [0, -0.01, -0.06] }),
        capsule(BONE.LFoot, BONE.LLeg, 0.08 * L, BONE.LLeg, 1),
        capsule(BONE.RFoot, BONE.RLeg, 0.08 * L, BONE.RLeg, 1),
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
