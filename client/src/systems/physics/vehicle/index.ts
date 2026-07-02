// physics/vehicle — client subsystem entrypoint. Implements the arcade raycast-vehicle stack on
// Rapier's DynamicRayCastVehicleController (via @react-three/rapier). Self-registers on import
// (see client/src/game/systems-loader.ts). Owns everything under this folder only.
//
// Contract (the single seam with gameplay/vehicle-gameplay):
//   • gameplay writes `veh_input: DriverInput` each frame (or via handle.setDriverInput)
//   • gameplay reads  `veh_state: VehicleState` (or handle.getState()) for HUD/audio/camera
//   • gameplay spawns via `spawnVehicle()` OR by adding a `veh_spawnRequest` component
//   • gameplay couples damage via `veh_engineHealth` (or handle.applyEngineHealth)
// Physics owns the fixed-step solver (controller.updateVehicle) — consumers must not call it.
//
// INTEGRATOR: mount <VehiclePhysicsView/> once inside <PhysicsProvider> (Scene.tsx). Everything
// else auto-wires through this module's self-registration.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./vehicle.components";
import { vehicleSpawnIntakeSystem } from "./systems";

type W = typeof world;

export const vehiclePhysics: SubsystemModule<W> = {
  id: "physics/vehicle",
  systems: [vehicleSpawnIntakeSystem],
};

registerModule(vehiclePhysics);

// ─── Public contract (types) ────────────────────────────────────────────────────────────────
export type {
  DriverInput,
  VehicleState,
  WheelSpec,
  VehicleArcadeConfig,
  VehicleConfig,
  VehicleKind,
  FlightConfig,
  BoatConfig,
  VehicleSpawnRequest,
  VehicleHandle,
  RapierVehicleController,
  RapierRigidBody,
} from "./types";
export type { SpawnVehicleOptions } from "./runtime";

// ─── Public contract (values) ───────────────────────────────────────────────────────────────
export { createEmptyDriverInput, createInitialVehicleState } from "./types";
export {
  spawnVehicle,
  despawnVehicle,
  getVehicleHandle,
  normalizeVehicleEntity,
  spawnTransform,
} from "./runtime";
export {
  VEHICLE_PRESETS,
  EXTENDED_PRESETS,
  ALL_VEHICLE_PRESETS,
  DEFAULT_VEHICLE_CONFIG,
  resolveVehicleConfig,
  computeChassisInertia,
  kindOf,
  ExtVehicleId,
} from "./presets";

// ─── Render bridge (mounted by the integrator inside <PhysicsProvider>) ───────────────────────
export { VehiclePhysicsView } from "./VehiclePhysicsView";
export { VehicleLandmarks, LANDMARKS } from "./VehicleLandmarks";
