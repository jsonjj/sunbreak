// physics/ragdoll — animation → ragdoll handoff.
//
// On trigger we copy each body's matching bone WORLD transform into the (kinematic) body, flip it
// to Dynamic, inherit the character's momentum (no dead-stop pop), then apply the hit impulse to
// the struck body. Finally we silence the animation mixer so it stops fighting physics.

import * as THREE from "three";
import type {
  BoneId,
  HitReactionParams,
  RapierNamespace,
  RigInstance,
} from "./types";

type BoneRefs = Partial<Record<BoneId, THREE.Bone>>;
type Vec = { x: number; y: number; z: number };

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _point = new THREE.Vector3();
const ZERO: Vec = { x: 0, y: 0, z: 0 };

/**
 * Wake a rig from parked → live physics.
 * @param refs   Resolved bones (jointed rigs). Empty/omitted for simple single-body mode.
 * @param root   Entity root Object3D — used to seed the single body when there are no bones.
 * @param seedVel Character linear velocity to inherit (world space).
 * @param hit    Optional impact to apply to the struck body.
 */
export function activateRig(
  rapier: RapierNamespace,
  rig: RigInstance,
  refs: BoneRefs,
  root: THREE.Object3D | undefined,
  seedVel: Vec,
  hit?: HitReactionParams,
  fallback?: { position: Vec; rotation: { x: number; y: number; z: number; w: number } },
): void {
  rig.inUse = true;

  for (const b of rig.spec.bodies) {
    const body = rig.bodies[b.id];
    if (!body) continue;
    body.setEnabled(true);

    const bone = refs[b.id];
    if (bone) {
      bone.getWorldPosition(_pos);
      bone.getWorldQuaternion(_quat);
    } else if (root) {
      // Simple/single-body mode: seat the body on the entity root.
      root.matrixWorld.decompose(_pos, _quat, _scale);
    } else if (fallback) {
      // No view object yet — seat on the ECS transform so the corpse starts in place.
      _pos.set(fallback.position.x, fallback.position.y, fallback.position.z);
      _quat.set(fallback.rotation.x, fallback.rotation.y, fallback.rotation.z, fallback.rotation.w);
    } else {
      _pos.set(0, 0, 0);
      _quat.identity();
    }

    body.setTranslation({ x: _pos.x, y: _pos.y, z: _pos.z }, false);
    body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, false);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setLinvel(seedVel, true);
    body.setAngvel(ZERO, true);
  }

  if (hit) applyImpulse(rig, hit);
}

/** Apply an impulse to the struck body (falls back to the root body if the bone isn't present). */
export function applyImpulse(rig: RigInstance, hit: HitReactionParams): void {
  const body = rig.bodies[hit.bone] ?? rig.bodies[rig.spec.rootBone];
  if (!body) return;
  _dir.set(hit.dir[0], hit.dir[1], hit.dir[2]);
  if (_dir.lengthSq() > 1e-9) _dir.normalize();
  _dir.multiplyScalar(hit.magnitude);

  if (hit.point) {
    _point.set(hit.point[0], hit.point[1], hit.point[2]);
  } else {
    const t = body.translation();
    _point.set(t.x, t.y, t.z);
  }
  body.applyImpulseAtPoint({ x: _dir.x, y: _dir.y, z: _dir.z }, { x: _point.x, y: _point.y, z: _point.z }, true);
}

/** Stop drei/useAnimations actions so animation no longer drives the skeleton. */
export function silenceMixer(mixer: THREE.AnimationMixer | undefined): void {
  if (mixer) mixer.stopAllAction();
}
