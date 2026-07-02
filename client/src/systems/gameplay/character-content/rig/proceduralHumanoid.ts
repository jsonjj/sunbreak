// Builds a "rig template" entirely in code: a Group holding ONE shared canonical skeleton, a
// full-body skin mannequin + face detail (always visible), and one SkinnedMesh per wardrobe variant
// (hidden by default). This is structurally identical to a conformed Quaternius rig-template GLB — so
// the SAME CharacterFactory.build() path works whether the template is procedural or loaded from disk.
//
// Why procedural at all: the CC0 GLBs are vendored offline (see assetSources.ts). Until they're
// present, this fallback lets the whole pipeline — clone, tint, animate, switch — run FOR REAL, and
// it now carries real proportion variety (5 builds), a face, and a broad wardrobe so a crowd of
// these reads as a believable mix of people rather than clones.

import * as THREE from "three";
import type { BodyId, PaletteChannel, Slot } from "../types";
import { eachVariant, partName } from "../modular/wardrobe";
import { box, capsule, ellipsoid, frustum, mergeParts, sphere, taperedLimb } from "./geometryKit";
import { BONE, buildBones, buildSkeleton } from "./skeleton";

interface Proportion {
  /** Limb girth (thickness of arms/legs/hands/feet). */
  limb: number;
  /** Torso girth (chest/waist thickness). */
  torso: number;
  /** Head size. */
  head: number;
  /** Shoulder / deltoid spread. */
  shoulder: number;
  /** Pelvis width. */
  hip: number;
  /** Extra belly volume (0 = flat). */
  belly: number;
  /** Small uniform height scale baked onto the template root (keeps slim/medium ≈ capsule height). */
  heightScale: number;
}

// Girth + a small uniform height scale vary per build. slim/medium stay at heightScale 1.0 so the
// playable leads keep matching the fixed player capsule; heavier/athletic builds get a touch taller.
const BODY_PROPORTIONS: Readonly<Record<BodyId, Proportion>> = {
  slim: { limb: 0.84, torso: 0.87, head: 0.97, shoulder: 0.9, hip: 0.92, belly: 0, heightScale: 1.0 },
  medium: { limb: 1, torso: 1, head: 1, shoulder: 1, hip: 1, belly: 0, heightScale: 1.0 },
  heavy: { limb: 1.2, torso: 1.28, head: 1.04, shoulder: 1.06, hip: 1.16, belly: 0.32, heightScale: 1.0 },
  athletic: { limb: 1.07, torso: 1.03, head: 0.99, shoulder: 1.2, hip: 0.97, belly: 0, heightScale: 1.03 },
  stocky: { limb: 1.15, torso: 1.16, head: 1.03, shoulder: 1.12, hip: 1.1, belly: 0.14, heightScale: 0.96 },
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
// head carries a jaw + nose + ears, and the hands/feet are shaped — so the base body reads as a
// person even nude, and clothing draped over it sits naturally.
function buildSkinBody(p: Proportion): THREE.BufferGeometry {
  const L = p.limb;
  const T = p.torso;
  const H = p.head;
  const S = p.shoulder;
  const HIP = p.hip;
  const parts: THREE.BufferGeometry[] = [
    // ── Head: cranium + jaw for a face-forward silhouette (jaw/nose toward -Z, the model's forward,
    // matching the feet + cap-brim, so the face leads the direction of travel). ──
    ellipsoid(BONE.Head, [0.088 * H, 0.104 * H, 0.095 * H], BONE.Head, { offset: [0, 0.045, 0.004] }),
    // jaw / chin mass, tucked slightly forward and down
    ellipsoid(BONE.Head, [0.063 * H, 0.056 * H, 0.074 * H], BONE.Head, { offset: [0, -0.03, -0.006] }),
    // brow / upper face bridge
    ellipsoid(BONE.Head, [0.072 * H, 0.03 * H, 0.03 * H], BONE.Head, { offset: [0, 0.03, -0.07] }),
    // nose
    ellipsoid(BONE.Head, [0.016 * H, 0.024 * H, 0.02 * H], BONE.Head, { offset: [0, 0.006, -0.092] }),
    // ears
    ellipsoid(BONE.Head, [0.014 * H, 0.03 * H, 0.02 * H], BONE.Head, { offset: [0.086 * H, 0.006, 0.006] }),
    ellipsoid(BONE.Head, [0.014 * H, 0.03 * H, 0.02 * H], BONE.Head, { offset: [-0.086 * H, 0.006, 0.006] }),
    // neck taper into the skull + a trapezius bridge to the shoulders
    taperedLimb(BONE.Neck, BONE.Head, 0.05 * H, 0.043 * H, BONE.Neck),
    ellipsoid(BONE.Neck, [0.12 * S, 0.05, 0.09], BONE.Spine2, { offset: [0, -0.03, 0.006] }),
    // ── Torso: chest (broad) → waist (narrow) → pelvis (flare) ──
    taperedLimb(BONE.Spine, BONE.Spine2, 0.116 * T, 0.15 * T * S, BONE.Spine1),
    taperedLimb(BONE.Hips, BONE.Spine, 0.14 * T * HIP, 0.116 * T, BONE.Hips),
    // pelvis / seat mass
    ellipsoid(BONE.Hips, [0.145 * T * HIP, 0.11 * T, 0.13 * T], BONE.Hips, { offset: [0, -0.02, 0.01] }),
    // deltoids bridge chest → arm
    ellipsoid(BONE.LArm, [0.064 * L * S, 0.062 * L, 0.064 * L], BONE.LArm, { offset: [0.012, 0.012, 0] }),
    ellipsoid(BONE.RArm, [0.064 * L * S, 0.062 * L, 0.064 * L], BONE.RArm, { offset: [-0.012, 0.012, 0] }),
    // arms: upper arm + forearm, each tapering to the joint below
    taperedLimb(BONE.LArm, BONE.LForeArm, 0.053 * L, 0.041 * L, BONE.LArm),
    taperedLimb(BONE.RArm, BONE.RForeArm, 0.053 * L, 0.041 * L, BONE.RArm),
    taperedLimb(BONE.LForeArm, BONE.LHand, 0.041 * L, 0.03 * L, BONE.LForeArm),
    taperedLimb(BONE.RForeArm, BONE.RHand, 0.041 * L, 0.03 * L, BONE.RForeArm),
    // hands: relaxed fists (rounded, slightly flattened)
    ellipsoid(BONE.LHand, [0.033 * L, 0.052 * L, 0.024 * L], BONE.LHand, { offset: [0, -0.045, 0] }),
    ellipsoid(BONE.RHand, [0.033 * L, 0.052 * L, 0.024 * L], BONE.RHand, { offset: [0, -0.045, 0] }),
    // legs: thigh + calf, tapering to knee / ankle
    taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.1 * L, 0.062 * L, BONE.LUpLeg),
    taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.1 * L, 0.062 * L, BONE.RUpLeg),
    taperedLimb(BONE.LLeg, BONE.LFoot, 0.063 * L, 0.038 * L, BONE.LLeg),
    taperedLimb(BONE.RLeg, BONE.RFoot, 0.063 * L, 0.038 * L, BONE.RLeg),
    // feet
    ...foot(BONE.LFoot, L),
    ...foot(BONE.RFoot, L),
  ];
  if (p.belly > 0) {
    // a soft gut that bulges forward (-Z) for the heavier builds
    parts.push(
      ellipsoid(BONE.Spine, [0.128 * T + 0.06 * p.belly, 0.12 * T, 0.11 * T + 0.07 * p.belly], BONE.Spine, {
        offset: [0, -0.04, -0.03],
      }),
    );
  }
  return mergeParts(parts);
}

// ── Face detail (eyes + brows) — a separate always-on base mesh tinted from the dark "detail"
// channel so the face reads at a glance without needing per-face textures. ──
function buildFaceDetail(p: Proportion): THREE.BufferGeometry {
  const H = p.head;
  return mergeParts([
    ellipsoid(BONE.Head, [0.017 * H, 0.02 * H, 0.012 * H], BONE.Head, { offset: [0.032, 0.028, -0.082] }),
    ellipsoid(BONE.Head, [0.017 * H, 0.02 * H, 0.012 * H], BONE.Head, { offset: [-0.032, 0.028, -0.082] }),
    box(BONE.Head, [0.03 * H, 0.008, 0.012], BONE.Head, { offset: [0.032, 0.05, -0.084] }),
    box(BONE.Head, [0.03 * H, 0.008, 0.012], BONE.Head, { offset: [-0.032, 0.05, -0.084] }),
  ]);
}

// ── Wardrobe shells ─────────────────────────────────────────────────────────────────────────────
function sleeves(r: number, foreScale = 0.9): THREE.BufferGeometry[] {
  return [
    capsule(BONE.LArm, BONE.LForeArm, r, BONE.LArm),
    capsule(BONE.RArm, BONE.RForeArm, r, BONE.RArm),
    capsule(BONE.LForeArm, BONE.LHand, r * foreScale, BONE.LForeArm),
    capsule(BONE.RForeArm, BONE.RHand, r * foreScale, BONE.RForeArm),
  ];
}

// short sleeves only cover the upper arm (tees/hoodies with pushed sleeves).
function shortSleeves(r: number): THREE.BufferGeometry[] {
  return [
    capsule(BONE.LArm, BONE.LForeArm, r, BONE.LArm, 0.86),
    capsule(BONE.RArm, BONE.RForeArm, r, BONE.RArm, 0.86),
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

// A flat open sandal (thin sole + a cross strap), enclosing the toe area only.
function sandal(bone: typeof BONE.LFoot | typeof BONE.RFoot, L: number): THREE.BufferGeometry[] {
  return [
    box(bone, [0.095 * L, 0.024, 0.25], bone, { offset: [0, -0.064, -0.05] }),
    box(bone, [0.1 * L, 0.02, 0.05], bone, { offset: [0, -0.03, -0.09] }),
  ];
}

function torsoShell(rMid: number, rLow: number, T: number): THREE.BufferGeometry {
  return mergeParts([
    taperedLimb(BONE.Spine, BONE.Spine2, rMid * T, (rMid + 0.028) * T, BONE.Spine1),
    taperedLimb(BONE.Hips, BONE.Spine, rLow * T, rMid * T, BONE.Hips),
  ]);
}

function collar(head: number): THREE.BufferGeometry {
  return sphere(BONE.Neck, 0.09 * head, BONE.Neck, { scale: [1.25, 0.55, 1.25], offset: [0, 0.02, 0] });
}

function buildVariantGeometry(slot: Slot, id: string, p: Proportion): THREE.BufferGeometry | null {
  const T = p.torso;
  const L = p.limb;
  const H = p.head;
  switch (id) {
    // torso ---------------------------------------------------------------------------------------
    case "torso_tee":
      return mergeParts([torsoShell(0.128, 0.132, T), ...shortSleeves(0.058 * L)]);
    case "torso_tank":
      return torsoShell(0.126, 0.13, T);
    case "torso_longsleeve":
      return mergeParts([torsoShell(0.128, 0.132, T), ...sleeves(0.052 * L)]);
    case "torso_jacket":
      return mergeParts([torsoShell(0.152, 0.156, T), ...sleeves(0.064 * L), collar(H)]);
    case "torso_hoodie":
      return mergeParts([
        torsoShell(0.156, 0.16, T),
        ...sleeves(0.066 * L),
        // hood bunched behind the neck (+Z is back)
        sphere(BONE.Neck, 0.1 * H, BONE.Spine2, { scale: [1.3, 0.9, 1.0], offset: [0, 0.02, 0.06] }),
        // kangaroo pocket
        box(BONE.Spine, [0.2, 0.1, 0.06], BONE.Spine, { offset: [0, -0.08, -0.12] }),
      ]);
    case "torso_vest":
      return mergeParts([torsoShell(0.15, 0.152, T), collar(H)]);
    case "torso_dress":
      return mergeParts([
        torsoShell(0.126, 0.13, T),
        ...shortSleeves(0.05 * L),
        // flared skirt from the waist to mid-thigh
        frustum(BONE.Hips, 0.44, 0.15 * T, 0.32, BONE.Hips, { offset: [0, -0.2, 0] }),
      ]);
    // legs ----------------------------------------------------------------------------------------
    case "legs_pants":
      return mergeParts([
        taperedLimb(BONE.Hips, BONE.Spine, 0.148 * T, 0.126 * T, BONE.Hips),
        taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.106 * L, 0.072 * L, BONE.LUpLeg),
        taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.106 * L, 0.072 * L, BONE.RUpLeg),
        taperedLimb(BONE.LLeg, BONE.LFoot, 0.072 * L, 0.05 * L, BONE.LLeg),
        taperedLimb(BONE.RLeg, BONE.RFoot, 0.072 * L, 0.05 * L, BONE.RLeg),
      ]);
    case "legs_joggers":
      return mergeParts([
        taperedLimb(BONE.Hips, BONE.Spine, 0.152 * T, 0.128 * T, BONE.Hips),
        taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.112 * L, 0.086 * L, BONE.LUpLeg),
        taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.112 * L, 0.086 * L, BONE.RUpLeg),
        // tapered cuff at the ankle
        taperedLimb(BONE.LLeg, BONE.LFoot, 0.084 * L, 0.058 * L, BONE.LLeg),
        taperedLimb(BONE.RLeg, BONE.RFoot, 0.084 * L, 0.058 * L, BONE.RLeg),
      ]);
    case "legs_shorts":
      return mergeParts([
        taperedLimb(BONE.Hips, BONE.Spine, 0.148 * T, 0.126 * T, BONE.Hips),
        taperedLimb(BONE.LUpLeg, BONE.LLeg, 0.11 * L, 0.088 * L, BONE.LUpLeg),
        taperedLimb(BONE.RUpLeg, BONE.RLeg, 0.11 * L, 0.088 * L, BONE.RUpLeg),
      ]);
    case "legs_skirt":
      return mergeParts([
        capsule(BONE.Hips, BONE.Spine, 0.13 * T, BONE.Hips),
        frustum(BONE.Hips, 0.4, 0.15 * T, 0.3, BONE.Hips, { offset: [0, -0.2, 0] }),
      ]);
    // feet ----------------------------------------------------------------------------------------
    case "feet_shoes":
      return mergeParts([...shoe(BONE.LFoot, L), ...shoe(BONE.RFoot, L)]);
    case "feet_boots":
      return mergeParts([
        ...shoe(BONE.LFoot, L, 0.02),
        ...shoe(BONE.RFoot, L, 0.02),
        capsule(BONE.LFoot, BONE.LLeg, 0.082 * L, BONE.LLeg, 1),
        capsule(BONE.RFoot, BONE.RLeg, 0.082 * L, BONE.RLeg, 1),
      ]);
    case "feet_sandals":
      return mergeParts([...sandal(BONE.LFoot, L), ...sandal(BONE.RFoot, L)]);
    // hair ----------------------------------------------------------------------------------------
    case "hair_short":
      return sphere(BONE.Head, 0.125 * H, BONE.Head, { scale: [1.05, 0.92, 1.05], offset: [0, 0.066, 0.008] });
    case "hair_buzz":
      return sphere(BONE.Head, 0.122 * H, BONE.Head, { scale: [1.02, 0.84, 1.02], offset: [0, 0.05, 0.006] });
    case "hair_long":
      return mergeParts([
        sphere(BONE.Head, 0.127 * H, BONE.Head, { scale: [1.06, 0.96, 1.06], offset: [0, 0.058, 0.006] }),
        // sheet down the back (+Z) and sides
        box(BONE.Head, [0.2, 0.32, 0.12], BONE.Head, { offset: [0, -0.08, 0.07] }),
      ]);
    case "hair_bun":
      return mergeParts([
        sphere(BONE.Head, 0.122 * H, BONE.Head, { scale: [1.04, 0.86, 1.04], offset: [0, 0.056, 0.006] }),
        sphere(BONE.Head, 0.06 * H, BONE.Head, { offset: [0, 0.17, 0.03] }),
      ]);
    case "hair_ponytail":
      return mergeParts([
        sphere(BONE.Head, 0.124 * H, BONE.Head, { scale: [1.04, 0.9, 1.04], offset: [0, 0.06, 0.006] }),
        ellipsoid(BONE.Head, [0.05, 0.15, 0.06], BONE.Head, { offset: [0, -0.02, 0.11] }),
      ]);
    case "hair_afro":
      return sphere(BONE.Head, 0.16 * H, BONE.Head, { scale: [1.12, 1.05, 1.1], offset: [0, 0.07, 0.01] });
    case "hair_mohawk":
      return mergeParts([
        sphere(BONE.Head, 0.12 * H, BONE.Head, { scale: [1.0, 0.7, 1.0], offset: [0, 0.04, 0.006] }),
        box(BONE.Head, [0.035, 0.13, 0.2], BONE.Head, { offset: [0, 0.15, 0.0] }),
      ]);
    // hat -----------------------------------------------------------------------------------------
    case "hat_cap":
      return mergeParts([
        sphere(BONE.Head, 0.128 * H, BONE.Head, { scale: [1.05, 0.62, 1.05], offset: [0, 0.11, 0.008] }),
        box(BONE.Head, [0.24, 0.03, 0.15], BONE.Head, { offset: [0, 0.085, -0.13] }),
      ]);
    case "hat_beanie":
      return mergeParts([
        sphere(BONE.Head, 0.132 * H, BONE.Head, { scale: [1.06, 0.82, 1.06], offset: [0, 0.08, 0.008] }),
        frustum(BONE.Head, 0.045, 0.135 * H, 0.14 * H, BONE.Head, { offset: [0, 0.02, 0.008] }),
      ]);
    // eyewear -------------------------------------------------------------------------------------
    case "glasses_round":
      return mergeParts([
        ellipsoid(BONE.Head, [0.022, 0.022, 0.008], BONE.Head, { offset: [0.032, 0.03, -0.088] }),
        ellipsoid(BONE.Head, [0.022, 0.022, 0.008], BONE.Head, { offset: [-0.032, 0.03, -0.088] }),
        box(BONE.Head, [0.026, 0.006, 0.006], BONE.Head, { offset: [0, 0.03, -0.088] }),
        box(BONE.Head, [0.006, 0.006, 0.09], BONE.Head, { offset: [0.06, 0.03, -0.03] }),
        box(BONE.Head, [0.006, 0.006, 0.09], BONE.Head, { offset: [-0.06, 0.03, -0.03] }),
      ]);
    case "glasses_sun":
      return mergeParts([
        ellipsoid(BONE.Head, [0.03, 0.024, 0.01], BONE.Head, { offset: [0.034, 0.03, -0.086] }),
        ellipsoid(BONE.Head, [0.03, 0.024, 0.01], BONE.Head, { offset: [-0.034, 0.03, -0.086] }),
        box(BONE.Head, [0.022, 0.008, 0.006], BONE.Head, { offset: [0, 0.032, -0.088] }),
        box(BONE.Head, [0.006, 0.006, 0.09], BONE.Head, { offset: [0.066, 0.03, -0.03] }),
        box(BONE.Head, [0.006, 0.006, 0.09], BONE.Head, { offset: [-0.066, 0.03, -0.03] }),
      ]);
    // accessory -----------------------------------------------------------------------------------
    case "acc_sling":
      return box(BONE.Spine1, [0.09, 0.34, 0.09], BONE.Spine1, { offset: [0.11, -0.02, 0.03] });
    case "acc_backpack":
      return mergeParts([
        box(BONE.Spine1, [0.28, 0.36, 0.16], BONE.Spine1, { offset: [0, -0.02, 0.17] }),
        // shoulder straps (over the front of each shoulder)
        box(BONE.Spine2, [0.05, 0.32, 0.05], BONE.Spine2, { offset: [0.12, -0.08, -0.06] }),
        box(BONE.Spine2, [0.05, 0.32, 0.05], BONE.Spine2, { offset: [-0.12, -0.08, -0.06] }),
      ]);
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
  if (p.heightScale !== 1) root.scale.setScalar(p.heightScale);
  const hips = bones[0];
  if (hips) root.add(hips);

  addSkinnedMesh(root, skeleton, "base::skin", buildSkinBody(p), { base: true, channel: "skin" }, true);
  addSkinnedMesh(root, skeleton, "base::detail", buildFaceDetail(p), { base: true, channel: "detail" }, true);

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
