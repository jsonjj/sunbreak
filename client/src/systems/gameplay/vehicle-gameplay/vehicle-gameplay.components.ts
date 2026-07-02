// ECS augmentation for vehicle-gameplay (declaration merging — never edit shared/**).
//
// Two prefixes, two owners:
//   • veh_*  — the SHARED physics↔gameplay handoff. Gameplay WRITES driver intent + engine
//              health; vehicle-physics READS them and WRITES back runtime telemetry. If the
//              physics subsystem also augments these keys, the integrator reconciles the two
//              declarations (ideally by promoting the shapes to shared/src/vehicles/types.ts).
//   • vg_*   — owned entirely by THIS subsystem (occupancy, durability, tags).
//
// This file MUST stay a module (the `import type` below guarantees that), otherwise the
// `declare module` would replace @sunbreak/shared instead of merging into it.

import type { SeatId, VehicleHealth, VehicleSpecId } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    // ── shared handoff (veh_) ────────────────────────────────────────────────
    // INTEGRATOR NOTE: the driver-intent / telemetry / engine-health channels are declared by
    // the physics/vehicle subsystem (canonical shapes: `veh_input: DriverInput`,
    // `veh_state: VehicleState`, `veh_engineHealth: number`, `veh_spawnRequest`, `veh_config`,
    // `veh_isVehicle`). Gameplay WRITES `veh_input`/`veh_engineHealth`/`veh_spawnRequest` and
    // READS `veh_state` on those same components — no duplicate declaration here (that caused a
    // `veh_state` type collision). We only own `veh_spec` + the `vg_*` gameplay state below.
    /** Handling-profile key (enum car OR extended roster: motorcycle/heli/plane/boat). */
    veh_spec?: VehicleSpecId;

    // ── gameplay-owned (vg_) ─────────────────────────────────────────────────
    /** Tag: a gameplay-managed vehicle (the root of every vehicle-gameplay query). */
    vg_vehicle?: true;
    /** Tag: spawned as a parked car (vs. a traffic/pool car). */
    vg_parked?: true;
    /** Durability + damage-stage model. */
    vg_health?: VehicleHealth;
    /** Cached seat count (from spec) for quick occupancy checks. */
    vg_seatCount?: number;
    /** On the PLAYER entity: which vehicle/seat they currently occupy. */
    vg_occupant?: { vehicleNetId: number; seat: SeatId };
  }
}
