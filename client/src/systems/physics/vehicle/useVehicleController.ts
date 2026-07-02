// Per-entity lifecycle for one Rapier raycast vehicle: create the controller + wheels from the
// chassis body, attach the live handle + `three`/`rigidBody` view components to the ECS entity,
// and anchor the drive/read-back work to the physics step. Cleans everything up on unmount.
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import {
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { VehicleConfig } from "./types";
import { getOrCreateHandle, type VehicleHandleImpl } from "./runtime";
import { applyDriverStep, readVehicleState } from "./handling";

// Suspension ray direction + axle axis (chassis-local); copied into WASM by addWheel, so the
// same shared objects are safe to reuse for every wheel.
const DOWN = { x: 0, y: -1, z: 0 };
const AXLE = { x: 1, y: 0, z: 0 };

interface Ref<T> {
  readonly current: T;
}

export function useVehicleController(
  entity: ClientEntity,
  config: VehicleConfig,
  chassisRef: Ref<RapierRigidBody | null>,
  visualRef: Ref<THREE.Group | null>,
  wheelRefs: Ref<(THREE.Group | null)[]>,
): void {
  const { world: rapierWorld, rapier } = useRapier();
  const handleRef = useRef<VehicleHandleImpl | null>(null);
  const filterFlags = rapier.QueryFilterFlags.EXCLUDE_SENSORS;
  const filterGroups = groupsFor(Layer.VEHICLE);

  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;

    const controller = rapierWorld.createVehicleController(chassis);
    controller.indexUpAxis = 1; // Y up
    controller.setIndexForwardAxis = 2; // +Z forward

    config.wheels.forEach((w, i) => {
      controller.addWheel(
        { x: w.position[0], y: w.position[1], z: w.position[2] },
        DOWN,
        AXLE,
        w.suspensionRestLength,
        w.radius,
      );
      controller.setWheelSuspensionStiffness(i, w.suspensionStiffness);
      controller.setWheelMaxSuspensionTravel(i, w.maxSuspensionTravel);
      controller.setWheelFrictionSlip(i, w.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, w.sideFrictionStiffness);
      controller.setWheelSuspensionCompression(i, w.suspensionCompression);
      controller.setWheelSuspensionRelaxation(i, w.suspensionRelaxation);
      controller.setWheelMaxSuspensionForce(i, w.maxSuspensionForce);
    });

    const handle = getOrCreateHandle(entity, config);
    handle.chassis = chassis;
    handle.controller = controller;
    handle.wheels = wheelRefs.current.filter((g): g is THREE.Group => g != null);
    handle.visual = visualRef.current ?? null;
    handle.baseFrictionSlip = config.wheels.map((w) => w.frictionSlip);
    handle.baseSideFriction = config.wheels.map((w) => w.sideFrictionStiffness);
    handle.engineHealth = entity.veh_engineHealth ?? 1;
    handle.markReady();
    handleRef.current = handle;

    // Publish the live refs onto the ECS entity for other subsystems (camera, AI, minimap...).
    if (!entity.rigidBody) world.addComponent(entity, "rigidBody", chassis);
    if (visualRef.current && !entity.three) world.addComponent(entity, "three", visualRef.current);

    return () => {
      rapierWorld.removeVehicleController(controller);
      handle.controller = null;
      handle.chassis = null;
      handle.wheels = [];
      handle.visual = null;
      handleRef.current = null;
      if (entity.rigidBody) world.removeComponent(entity, "rigidBody");
      if (entity.three) world.removeComponent(entity, "three");
    };
    // Refs are stable; listed so exhaustive-deps is satisfied without suppression.
  }, [rapierWorld, entity, config, chassisRef, visualRef, wheelRefs]);

  useBeforePhysicsStep((w) => {
    const handle = handleRef.current;
    if (handle) applyDriverStep(handle, w.timestep, filterFlags, filterGroups);
  });

  useAfterPhysicsStep(() => {
    const handle = handleRef.current;
    if (handle) readVehicleState(handle);
  });
}
