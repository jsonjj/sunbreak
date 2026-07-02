// Per-entity lifecycle for a NON-wheeled vehicle (helicopter / plane / boat). Unlike the
// raycast car path (useVehicleController), this creates no Rapier vehicle controller: the
// chassis is a plain dynamic body and the arcade flight/boat models push forces onto it inside
// the fixed physics step. It shares the same VehicleHandle registry + `three`/`rigidBody` view
// components + `veh_state` telemetry channel as the car path, so gameplay/camera/HUD are agnostic.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useAfterPhysicsStep, useBeforePhysicsStep, type RapierRigidBody } from "@react-three/rapier";
import { PHYS_DT } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { createInitialVehicleState, type VehicleConfig } from "./types";
import { getOrCreateHandle, type VehicleHandleImpl } from "./runtime";
import { kindOf } from "./presets";
import { applyFlightStep } from "./flight";
import { applyBoatStep } from "./boat";

interface Ref<T> {
  readonly current: T;
}

const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _v = new THREE.Vector3();
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Read chassis motion back onto telemetry + the ECS transform, and spin rotor/prop visuals. */
function readDynamicState(handle: VehicleHandleImpl, dt: number): void {
  const chassis = handle.chassis;
  if (!chassis) return;
  const cfg = handle.config;
  const entity = handle.entity;
  const kind = kindOf(cfg);

  const lin = chassis.linvel();
  _v.set(lin.x, lin.y, lin.z);
  const speed = _v.length();
  const r = chassis.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  _fwd.set(0, 0, 1).applyQuaternion(_q);
  const fwdSpeed = _v.dot(_fwd);
  const p = chassis.translation();

  // Rotor / propeller spin (visual): rate follows collective/throttle, with a visible idle.
  const f = cfg.flight;
  let power = 0;
  if (f) {
    power = f.fixedWing ? clamp01(entity.veh_input?.throttle ?? 0) : clamp01(entity.veh_input?.lift ?? 0);
    const spinRate = f.rotorSpinRate * Math.max(0.28, power);
    handle.rotorAngle += spinRate * dt;
    for (const rg of handle.rotors) {
      const axis = (rg.userData.spinAxis as "x" | "y" | "z") ?? "y";
      rg.rotation[axis] = handle.rotorAngle;
    }
  } else if (cfg.boat) {
    power = clamp01(entity.veh_input?.throttle ?? 0);
  }

  const waterLevel = cfg.boat?.waterLevel ?? 0;
  const airborne = kind === "boat" ? false : p.y > 1.6;
  const state = (entity.veh_state ??= createInitialVehicleState());
  state.speedKmh = speed * 3.6;
  state.forwardSpeed = fwdSpeed;
  state.rpm01 = clamp01(0.15 + power * 0.85);
  state.gear = 1;
  state.engineHealth = clamp01(entity.veh_engineHealth ?? 1);
  state.isDrifting = false;
  state.grounded = kind === "boat" ? waterLevel - p.y > -0.5 : !airborne;
  state.wheelsOnGround = 0;
  state.airborne = airborne;
  state.altitudeM = p.y;

  const tf = entity.transform;
  if (tf) {
    tf.position.x = p.x;
    tf.position.y = p.y;
    tf.position.z = p.z;
    tf.rotation.x = r.x;
    tf.rotation.y = r.y;
    tf.rotation.z = r.z;
    tf.rotation.w = r.w;
  }
}

/**
 * Wire a helicopter/plane/boat entity to the arcade dynamics. Mirrors useVehicleController's
 * lifecycle but takes rotor visual groups (spun each step) instead of wheel groups.
 */
export function useDynamicVehicleController(
  entity: ClientEntity,
  config: VehicleConfig,
  chassisRef: Ref<RapierRigidBody | null>,
  visualRef: Ref<THREE.Group | null>,
  rotorRefs: Ref<(THREE.Object3D | null)[]>,
): void {
  const handleRef = useRef<VehicleHandleImpl | null>(null);

  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;

    const handle = getOrCreateHandle(entity, config);
    handle.chassis = chassis;
    handle.controller = null;
    handle.visual = visualRef.current ?? null;
    handle.rotors = rotorRefs.current.filter((g): g is THREE.Object3D => g != null);
    handle.engineHealth = entity.veh_engineHealth ?? 1;
    handle.markReady();
    handleRef.current = handle;

    if (!entity.rigidBody) world.addComponent(entity, "rigidBody", chassis);
    if (visualRef.current && !entity.three) world.addComponent(entity, "three", visualRef.current);

    return () => {
      handle.chassis = null;
      handle.controller = null;
      handle.visual = null;
      handle.rotors = [];
      handleRef.current = null;
      if (entity.rigidBody) world.removeComponent(entity, "rigidBody");
      if (entity.three) world.removeComponent(entity, "three");
    };
  }, [entity, config, chassisRef, visualRef, rotorRefs]);

  useBeforePhysicsStep((w) => {
    const handle = handleRef.current;
    if (!handle) return;
    if (kindOf(handle.config) === "boat") applyBoatStep(handle, w.timestep);
    else applyFlightStep(handle, w.timestep);
  });

  useAfterPhysicsStep(() => {
    const handle = handleRef.current;
    if (handle) readDynamicState(handle, PHYS_DT);
  });
}
