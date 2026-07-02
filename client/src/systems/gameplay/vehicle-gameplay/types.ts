// Public value/data contracts for the vehicle-gameplay subsystem.
//
// The two most important shapes are the SEAM with vehicle-physics:
//   - `DriverInput`         : gameplay -> physics (written to the shared `veh_driverInput` comp)
//   - `VehicleRuntimeState` : physics -> gameplay (read from the shared `veh_state` comp)
// See `vehicle-gameplay.components.ts` for where these attach to the ECS.

import type { VehicleId } from "@sunbreak/shared";

/** Seats we model in v1 (front row). Rear seats land with multi-seat in v2. */
export type SeatId = "driver" | "passenger" | "rearLeft" | "rearRight";

/**
 * Normalized driver intent — THE contract handed to vehicle-physics.
 * Physics maps this onto steering angle + wheel engine/brake forces. All fields are already
 * assist-processed (smoothed steer, speed-sensitive lock, resolved reverse) by the time they
 * are written to `veh_driverInput`.
 */
export interface DriverInput {
  throttle: number; // 0..1 accelerator
  brake: number; // 0..1 brake pedal
  steer: number; // -1..1 (left .. right)
  handbrake: boolean;
  reverse: boolean; // true when the driver intends the reverse gear
}

export const emptyDriverInput = (): DriverInput => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reverse: false,
});

/**
 * Telemetry written BACK by vehicle-physics into `veh_state`, read here for the speedometer/HUD
 * and damage coupling. Consumers MUST tolerate it being absent — physics may not have populated
 * it yet, in which case gameplay falls back to a transform-derived speed (see `speed.ts`).
 */
export interface VehicleRuntimeState {
  speedKmh: number; // |planar velocity| in km/h
  forwardKmh: number; // signed along chassis forward (negative = reversing)
  rpm: number; // approximate engine rpm (HUD/audio)
  gear: number; // -1 reverse, 0 neutral, 1..n forward
  wheelsGrounded: number; // 0..4
  engineHealth01: number; // physics' echo of the applied engine-health cap
}

export type VehicleDamageStage = "ok" | "smoking" | "burning" | "wrecked";

/** Gameplay-owned durability model (physics realizes the perf cap via `veh_engineHealth01`). */
export interface VehicleHealth {
  hp: number;
  maxHp: number;
  engineHealth: number; // 0..1 performance multiplier fed to physics
  stage: VehicleDamageStage;
  lastHitAtSec: number; // wall-clock secs of last damage (contact cooldown)
  wreckedAtSec: number; // 0 until wrecked; drives the despawn timer
}

/** Rich, HUD-facing snapshot (mirrored non-reactively into `hudRef`, reactively into the store). */
export interface VehicleHudSnapshot {
  active: boolean; // player is in a vehicle
  spec: VehicleId | null;
  speedKmh: number;
  speedMph: number;
  rpm: number;
  gear: number;
  hp01: number; // 0..1 chassis health
  engineHealth01: number; // 0..1 engine performance
  stage: VehicleDamageStage;
  station: number | null; // radio station index (null = off) — reserved for radio subsystem
}

export const emptyVehicleHud = (): VehicleHudSnapshot => ({
  active: false,
  spec: null,
  speedKmh: 0,
  speedMph: 0,
  rpm: 0,
  gear: 0,
  hp01: 1,
  engineHealth01: 1,
  stage: "ok",
  station: null,
});
