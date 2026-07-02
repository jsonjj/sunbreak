// physics/ragdoll — imperative rig construction on the SHARED Rapier world.
//
// We build bodies/colliders/joints directly via the raw world (not declarative <RigidBody>),
// because pooling + per-frame bone sync + cheap enable/disable all require imperative control.
// Rigs are created PARKED: kinematic, disabled, and shoved far off-world. `activate()` wakes them.

import {
  BODY_ANGULAR_DAMPING,
  BODY_FRICTION,
  BODY_LINEAR_DAMPING,
  BODY_RESTITUTION,
  PARK_ORIGIN,
  PARK_SPACING,
  RAGDOLL_COLLISION_GROUPS,
} from "./config";
import type {
  BoneId,
  RapierBody,
  RapierImpulseJoint,
  RapierNamespace,
  RapierWorld,
  RigInstance,
  RigSpec,
} from "./types";

const v = (t: readonly [number, number, number]) => ({ x: t[0], y: t[1], z: t[2] });

/**
 * Build one parked rig from `spec`. `slot` spaces parked rigs apart so their disabled bodies
 * never overlap. Bodies are kinematicPositionBased + disabled; `activate()` flips them dynamic.
 */
export function buildRagdoll(
  rapier: RapierNamespace,
  world: RapierWorld,
  spec: RigSpec,
  slot: number,
): RigInstance {
  const parkX = PARK_ORIGIN.x + slot * PARK_SPACING;
  const bodies: Partial<Record<BoneId, RapierBody>> = {};

  for (const b of spec.bodies) {
    const desc = rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(parkX, PARK_ORIGIN.y, PARK_ORIGIN.z)
      .setLinearDamping(BODY_LINEAR_DAMPING)
      .setAngularDamping(BODY_ANGULAR_DAMPING)
      .setCanSleep(true)
      .setEnabled(false);
    const body = world.createRigidBody(desc);
    const collider = rapier.ColliderDesc.capsule(b.half, b.radius)
      .setMass(b.mass)
      .setFriction(BODY_FRICTION)
      .setRestitution(BODY_RESTITUTION)
      .setCollisionGroups(RAGDOLL_COLLISION_GROUPS);
    world.createCollider(collider, body);
    bodies[b.id] = body;
  }

  const joints: RapierImpulseJoint[] = [];
  for (const j of spec.joints) {
    const a = bodies[j.a];
    const b = bodies[j.b];
    if (!a || !b) continue;
    let data;
    if (j.type === "spherical") {
      data = rapier.JointData.spherical(v(j.anchorA), v(j.anchorB));
    } else {
      data = rapier.JointData.revolute(v(j.anchorA), v(j.anchorB), v(j.axis ?? [1, 0, 0]));
      // Field names verified against @dimforge/rapier3d-compat 0.19.2 (JointData.limitsEnabled /
      // .limits). Self-collision-off + damping bound poses even if a limit is ignored.
      if (j.limits) {
        data.limitsEnabled = true;
        data.limits = [j.limits[0], j.limits[1]];
      }
    }
    joints.push(world.createImpulseJoint(data, a, b, true));
  }

  return { tier: spec.tier, spec, bodies, joints, inUse: false, slot };
}

/** Tear down a rig (only on pool shrink / unmount — never per death). */
export function destroyRagdoll(world: RapierWorld, rig: RigInstance): void {
  for (const joint of rig.joints) {
    try {
      world.removeImpulseJoint(joint, false);
    } catch {
      /* already gone */
    }
  }
  rig.joints.length = 0;
  for (const id of Object.keys(rig.bodies) as BoneId[]) {
    const body = rig.bodies[id];
    if (!body) continue;
    try {
      world.removeRigidBody(body);
    } catch {
      /* already gone */
    }
    delete rig.bodies[id];
  }
}

/** Park a rig: kinematic, disabled, off-world. Called on release back to the pool. */
export function parkRagdoll(rapier: RapierNamespace, rig: RigInstance): void {
  const parkX = PARK_ORIGIN.x + rig.slot * PARK_SPACING;
  for (const id of Object.keys(rig.bodies) as BoneId[]) {
    const body = rig.bodies[id];
    if (!body) continue;
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, false);
    body.setTranslation({ x: parkX, y: PARK_ORIGIN.y, z: PARK_ORIGIN.z }, false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    body.setEnabled(false);
  }
  rig.inUse = false;
}
