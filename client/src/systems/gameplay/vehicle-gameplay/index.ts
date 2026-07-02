// Subsystem: gameplay/vehicle-gameplay (client) — enter/exit, driving intent, speedometer HUD,
// vehicle health/damage, and spawning. Self-registers on import (systems-loader picks up this
// root index automatically). Owns everything under this folder; touches no other subsystem.
//
// Data flow:  input snapshot → assists → veh_driverInput ─(physics reads)→ chassis motion
//             chassis → veh_state / transform → speed → HUD store + hudRef + damage coupling
//
// The `veh_*` components are the shared handoff to vehicle-physics; `vg_*` are gameplay-owned.
// See vehicle-gameplay.components.ts and the integrator notes in the PR description.

import "./vehicle-gameplay.components"; // activate the ECS augmentation (declaration merge)

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

import { enterExitSystem, resetEnterExit } from "./enterExit";
import { syncOccupantPosition, voidRespawnCheck } from "./playerTracking";
import { driveSystem, resetDrive } from "./drive";
import { damageSystem } from "./damage";
import { spawnBootstrapSystem, wreckSweepSystem, resetSpawner } from "./spawner";
import { vehicleHudSystem, resetHud } from "./hud";
import { resetVehicleStore } from "./store";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "gameplay/vehicle-gameplay",
  systems: [
    // update phase (gameplay)
    { name: "vg:spawnBootstrap", phase: "update", order: -30, fn: spawnBootstrapSystem },
    { name: "vg:enterExit", phase: "update", order: -10, fn: enterExitSystem },
    // Mirror the driven vehicle's position onto the player entity so the minimap + cops/AI track the
    // player while seated (runs right after enter/exit sets vg_occupant, before movers/readers).
    { name: "vg:occupantSync", phase: "update", order: -5, fn: syncOccupantPosition },
    { name: "vg:drive", phase: "update", order: 0, fn: driveSystem },
    { name: "vg:damage", phase: "update", order: 10, fn: damageSystem },
    { name: "vg:wreckSweep", phase: "update", order: 20, fn: wreckSweepSystem },
    // Void safety net (replaces the boundary walls): fell into the void / drove out of bounds →
    // respawn at the main spawn (on foot or in vehicle), velocity zeroed.
    { name: "vg:voidRespawn", phase: "update", order: 25, fn: voidRespawnCheck },
    // finish phase (HUD mirror) — after the v0 hudSync (order 0) so vehicle speed wins in-car
    { name: "vg:hud", phase: "finish", order: 10, fn: vehicleHudSystem },
  ],
  init() {
    return () => {
      resetEnterExit();
      resetDrive();
      resetHud();
      resetSpawner();
      resetVehicleStore();
    };
  },
};

registerModule(mod); // required self-registration side effect

// ── Public API (consumed by traffic / missions / economy / combat / HUD / camera) ────────
export { spawnVehicle, despawnVehicle, acquireVehicle, releaseVehicle } from "./spawner";
export { applyVehicleDamage, applyContactDamage, explodeVehicle } from "./damage";
export {
  useVehicleStore,
  useVehicleHud,
  useVehicleOccupancy,
  useIsInVehicle,
  hudRef,
} from "./store";
export type { Occupancy, VgFsm } from "./store";
export type {
  DriverInput,
  VehicleRuntimeState,
  VehicleHealth,
  VehicleHudSnapshot,
  VehicleDamageStage,
  SeatId,
} from "./types";
