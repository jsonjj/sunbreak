// physics/ragdoll — physics bodies → SkinnedMesh bones (and the reverse capture).
//
// The documented fix for skin explosion: write the ROOT bone's position + rotation, but only
// the ROTATION of child bones (their rest-pose local offsets encode fixed bone lengths — writing
// child positions distorts skinning). We walk top-down so each child reads a fresh parent.

import * as THREE from "three";
import type { BoneId, RigInstance, RigSpec, RapierBody } from "./types";

type BoneRefs = Partial<Record<BoneId, THREE.Bone>>;

// Module-scope scratch — zero per-frame allocation.
const _pos = new THREE.Vector3();
const _posLocal = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _parentQuat = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/** Find the first SkinnedMesh under a character root (or null for a plain mesh / v0 capsule). */
export function findSkinnedMesh(root: THREE.Object3D | undefined): THREE.SkinnedMesh | null {
  if (!root) return null;
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  return found;
}

/** Resolve each rig body's Mixamo bone from the mesh skeleton (skips any missing bone). */
export function resolveBones(mesh: THREE.SkinnedMesh, spec: RigSpec): BoneRefs {
  const refs: BoneRefs = {};
  const skel = mesh.skeleton;
  for (const b of spec.bodies) {
    const bone = skel.getBoneByName(b.bone);
    if (bone) refs[b.id] = bone;
  }
  return refs;
}

function bodyWorldPos(body: RapierBody, out: THREE.Vector3): THREE.Vector3 {
  const t = body.translation();
  return out.set(t.x, t.y, t.z);
}

function bodyWorldQuat(body: RapierBody, out: THREE.Quaternion): THREE.Quaternion {
  const r = body.rotation();
  return out.set(r.x, r.y, r.z, r.w);
}

/**
 * Sync a jointed rig onto a SkinnedMesh. Root bone gets full pos+rot; children get rotation
 * only (rest-pose offsets preserved). Assumes `spec.childOrder` is parent-before-child.
 */
export function syncSkinned(rig: RigInstance, refs: BoneRefs, spec: RigSpec): void {
  const rootBody = rig.bodies[spec.rootBone];
  const rootBone = refs[spec.rootBone];
  if (rootBody && rootBone && rootBone.parent) {
    const parent = rootBone.parent;
    parent.updateWorldMatrix(true, false);
    // World → parent-local position.
    bodyWorldPos(rootBody, _pos);
    _m.copy(parent.matrixWorld).invert();
    _pos.applyMatrix4(_m);
    rootBone.position.copy(_pos);
    // World → parent-local rotation.
    _m.extractRotation(parent.matrixWorld);
    _parentQuat.setFromRotationMatrix(_m).invert();
    bodyWorldQuat(rootBody, _quat);
    rootBone.quaternion.copy(_parentQuat.multiply(_quat));
    rootBone.updateWorldMatrix(false, false);
  }

  syncSkinnedBones(rig, refs, spec.childOrder);
}

/** Rotation-only body→bone write for a subset of bones (used by powered/partial reactions). */
export function syncSkinnedBones(rig: RigInstance, refs: BoneRefs, ids: BoneId[]): void {
  for (const id of ids) {
    const body = rig.bodies[id];
    const bone = refs[id];
    if (!body || !bone || !bone.parent) continue;
    // Refresh the ancestor chain first: Mixamo skeletons interleave non-rig bones (Spine1, Neck,
    // hands…) between our driven bodies, so the parent's world can be stale. Walking up (using each
    // bone's current local, incl. the root we set above) yields a correct parent world cheaply.
    bone.parent.updateWorldMatrix(true, false);
    // Rotation-only: local = parentWorld^-1 * bodyWorld (rest-pose position preserved).
    _m.extractRotation(bone.parent.matrixWorld);
    _parentQuat.setFromRotationMatrix(_m).invert();
    bodyWorldQuat(body, _quat);
    bone.quaternion.copy(_parentQuat.multiply(_quat));
    bone.updateWorldMatrix(false, false);
  }
}

/**
 * "Simple mode" for entities without a skeleton (Tier2 / plain mesh / the v0 capsule): drive the
 * entity's root Object3D straight from the single pelvis body, and mirror into `transform` so the
 * rest of the ECS sees the corpse move.
 */
export function syncSimple(
  rig: RigInstance,
  root: THREE.Object3D | undefined,
  transform?: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } },
): void {
  const body = rig.bodies[rig.spec.rootBone];
  if (!body) return;
  bodyWorldPos(body, _pos); // world position (kept intact for the transform mirror)
  bodyWorldQuat(body, _quat); // world rotation
  if (root) {
    if (root.parent) {
      root.parent.updateWorldMatrix(true, false);
      _m.copy(root.parent.matrixWorld).invert();
      root.position.copy(_posLocal.copy(_pos).applyMatrix4(_m));
      _m.extractRotation(root.parent.matrixWorld);
      _parentQuat.setFromRotationMatrix(_m).invert();
      root.quaternion.copy(_parentQuat.multiply(_quat));
    } else {
      root.position.copy(_pos);
      root.quaternion.copy(_quat);
    }
    root.updateMatrixWorld(true);
  }
  if (transform) {
    transform.position.x = _pos.x;
    transform.position.y = _pos.y;
    transform.position.z = _pos.z;
    const r = body.rotation();
    transform.rotation.x = r.x;
    transform.rotation.y = r.y;
    transform.rotation.z = r.z;
    transform.rotation.w = r.w;
  }
}
