import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  CROUCH_SPEED,
  CROUCH_TRANSITION,
  DEFAULT_SPAWN,
  InputAction,
  JUMP_SPEED,
  Layer,
  MOVE_ACCEL,
  PHYS_DT,
  PLAYER_CAPSULE,
  PLAYER_GRAVITY,
  RUN_SPEED,
  SPRINT_SPEED,
  TERMINAL_FALL,
  WALK_SPEED,
  COYOTE_TIME,
  JUMP_BUFFER,
  groupsFor,
} from "@sunbreak/shared";
import { input } from "../input/InputManager";
import { useCharacterController } from "./useCharacterController";
import { playerHandle } from "./playerHandle";
import { computeMode, locomotion } from "./locomotion";
import { spawnLocalPlayer, removeEntity } from "../game/factories";
import { world } from "../ecs/world";
import type { ClientEntity } from "../ecs/clientEntity";

// Module-scope scratch — zero per-frame allocation.
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const desired = new THREE.Vector3();

export function PlayerController() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const ccRef = useCharacterController();
  const { rapier, world: physicsWorld } = useRapier();
  const entityRef = useRef<ClientEntity | null>(null);
  const upRayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const s = useRef({
    vVel: 0,
    speed: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    prevJump: false,
    facing: 0,
    crouchT: 0, // 0 = standing, 1 = fully crouched (smoothly eased)
    halfHeight: PLAYER_CAPSULE.halfHeight as number, // live capsule half-height (last applied)
  });

  // ECS entity lifecycle.
  useEffect(() => {
    const e = spawnLocalPlayer(DEFAULT_SPAWN);
    entityRef.current = e;
    return () => {
      removeEntity(e);
      entityRef.current = null;
    };
  }, []);

  // Capture the physics body handle for the camera + queries.
  useEffect(() => {
    const b = bodyRef.current;
    if (b) {
      playerHandle.body = b;
      const e = entityRef.current;
      if (e && !e.rigidBody) world.addComponent(e, "rigidBody", b);
    }
    return () => {
      playerHandle.body = null;
    };
  }, []);

  useBeforePhysicsStep(() => {
    const cc = ccRef.current;
    const body = bodyRef.current;
    if (!cc || !body) return;
    // Seated seam: while the player occupies a vehicle, the on-foot controller yields entirely —
    // vehicle-gameplay owns the body (frozen) and the camera follows the car. See CameraRig.
    if (entityRef.current?.vg_occupant) return;
    const collider = body.collider(0);
    if (!collider) return;

    const dt = PHYS_DT;
    const st = s.current;

    // Camera-relative movement direction.
    const yaw = input.yaw;
    const mv = input.getMove();
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    moveDir.set(0, 0, 0).addScaledVector(forward, mv.y).addScaledVector(right, mv.x);
    const moving = moveDir.lengthSq() > 1e-6;
    if (moveDir.lengthSq() > 1) moveDir.normalize();

    // Speed tier + smoothing.
    const crouch = input.isActionDown(InputAction.Crouch);
    const walk = input.isActionDown(InputAction.Walk);
    const sprint = input.isActionDown(InputAction.Sprint);
    const targetSpeed = crouch
      ? CROUCH_SPEED
      : sprint
        ? SPRINT_SPEED
        : walk
          ? WALK_SPEED
          : RUN_SPEED;
    st.speed = THREE.MathUtils.damp(st.speed, moving ? targetSpeed : 0, MOVE_ACCEL, dt);

    // ── Crouch: shrink the capsule half-height (and with it the body center — which the follow
    //    camera anchors to and the feet-origin rig offsets from), keeping the feet planted. This is
    //    hold-to-crouch (InputAction.Crouch = KeyC / Left-Ctrl; see keymap). ─────────────────────
    const prevHH = st.halfHeight;
    let wantCrouch = crouch;
    if (!wantCrouch && st.crouchT > 0.15) {
      // Standing up: veto it while a ceiling sits within the headroom the taller capsule needs.
      const p0 = body.translation();
      const need = 2 * (PLAYER_CAPSULE.halfHeight - prevHH) + 0.06;
      const ray = (upRayRef.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
      ray.origin.x = p0.x;
      ray.origin.y = p0.y + prevHH + PLAYER_CAPSULE.radius - 0.02; // just under the current head
      ray.origin.z = p0.z;
      ray.dir.x = 0;
      ray.dir.y = 1;
      ray.dir.z = 0;
      if (physicsWorld.castRay(ray, need, true, undefined, undefined, undefined, body)) {
        wantCrouch = true;
      }
    }
    st.crouchT = THREE.MathUtils.damp(st.crouchT, wantCrouch ? 1 : 0, CROUCH_TRANSITION, dt);
    const hh = THREE.MathUtils.lerp(
      PLAYER_CAPSULE.halfHeight,
      PLAYER_CAPSULE.crouchHalfHeight,
      st.crouchT,
    );
    const dHH = hh - prevHH;
    st.halfHeight = hh;
    if (Math.abs(dHH) > 1e-6 || st.crouchT > 1e-4) collider.setHalfHeight(hh);

    // Coyote time + jump buffer.
    st.coyote = st.grounded ? COYOTE_TIME : Math.max(0, st.coyote - dt);
    const jumpDown = input.isActionDown(InputAction.Jump);
    const jumpPressed = jumpDown && !st.prevJump;
    st.prevJump = jumpDown;
    st.jumpBuffer = jumpPressed ? JUMP_BUFFER : Math.max(0, st.jumpBuffer - dt);

    // Gravity + jump.
    st.vVel += PLAYER_GRAVITY * dt;
    if (st.jumpBuffer > 0 && (st.grounded || st.coyote > 0)) {
      st.vVel = JUMP_SPEED;
      st.jumpBuffer = 0;
      st.coyote = 0;
    }
    if (st.vVel < TERMINAL_FALL) st.vVel = TERMINAL_FALL;

    // Resolve move-and-slide against colliders.
    desired.set(moveDir.x * st.speed, st.vVel, moveDir.z * st.speed).multiplyScalar(dt);
    // Keep the feet planted through a capsule resize: standing up (dHH > 0) raises the center so the
    // taller capsule doesn't sink into the floor (overriding the grounded down-stick); crouching
    // (dHH < 0) sinks the center to meet the ground. No-op when not transitioning (dHH === 0).
    if (dHH > 0) desired.y = st.grounded ? dHH : desired.y + dHH;
    else desired.y += dHH;
    cc.computeColliderMovement(
      collider,
      desired,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      groupsFor(Layer.PLAYER),
    );
    const m = cc.computedMovement();
    const p = body.translation();
    body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });

    st.grounded = cc.computedGrounded();
    if (st.grounded && st.vVel < 0) st.vVel = -2;

    // Face movement direction (shortest-angle damp, wrap-safe).
    if (moving) st.facing = Math.atan2(-moveDir.x, -moveDir.z);
    const vis = visualRef.current;
    if (vis) {
      let diff = st.facing - vis.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      vis.rotation.y += diff * (1 - Math.exp(-12 * dt));
    }

    // Publish locomotion + mirror into the ECS entity.
    const np = body.translation();
    const mode = computeMode({ moving, grounded: st.grounded, vVel: st.vVel, crouch, sprint, walk });
    locomotion.speed = st.speed;
    locomotion.normalizedSpeed = Math.min(1, st.speed / SPRINT_SPEED);
    locomotion.mode = mode;
    locomotion.isMoving = moving;
    locomotion.isGrounded = st.grounded;
    locomotion.isSprinting = sprint;
    locomotion.isCrouching = crouch;
    locomotion.isJumping = mode === "jump";
    locomotion.isFalling = mode === "fall";
    locomotion.verticalVelocity = st.vVel;
    locomotion.facing = st.facing;
    locomotion.position.x = np.x;
    locomotion.position.y = np.y;
    locomotion.position.z = np.z;

    const e = entityRef.current;
    if (e?.transform) {
      e.transform.position.x = np.x;
      e.transform.position.y = np.y;
      e.transform.position.z = np.z;
    }
    if (e?.movement) {
      e.movement.speed = st.speed;
      e.movement.normalizedSpeed = locomotion.normalizedSpeed;
      e.movement.grounded = st.grounded;
      e.movement.facing = st.facing;
      e.movement.mode = mode;
    }
    // The feet-origin rig offset tracks the live half-height so the model stays on the ground as
    // the capsule center lowers while crouching (drive system reads char_yOffset each frame).
    if (e && e.char_yOffset !== undefined) e.char_yOffset = -(hh + PLAYER_CAPSULE.radius);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={DEFAULT_SPAWN}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider
        args={[PLAYER_CAPSULE.halfHeight, PLAYER_CAPSULE.radius]}
        collisionGroups={groupsFor(Layer.PLAYER)}
      />
      {/* v0 capsule visual removed — gameplay/character-content attaches a rigged lead to the
          player entity (its `three` renders through the generic ECS↔R3F bridge). The empty group
          keeps the visualRef stable for the controller's (now inert) facing damp. */}
      <group ref={visualRef} />
    </RigidBody>
  );
}
