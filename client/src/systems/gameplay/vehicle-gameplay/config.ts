// Data-driven vehicle specs + gameplay tuning. These are GAMEPLAY hints (enter radius, seat
// offsets, assist curves, HUD ranges, durability). Authoritative handling (tire/suspension/
// engine curves) lives in vehicle-physics; if physics reads `topSpeedKmh`/`mass` from the spec
// that's fine, but gameplay never simulates the chassis itself.

import { VehicleId, type Vec3 } from "@sunbreak/shared";
import type { SeatId } from "./types";

export interface SeatConfig {
  id: SeatId;
  /** Body-local seat anchor (metres). Forward is -Z, up is +Y, right is +X. */
  offset: Vec3;
  /** Body-local point to place the character on exit (beside the door). */
  exit: Vec3;
}

export interface VehicleSpec {
  id: VehicleId;
  label: string;
  /** Asset prefab hint for the render/asset subsystem. Only "sedan" is defined in v0. */
  prefab: "sedan";
  maxHp: number;
  topSpeedKmh: number;
  mass: number;
  /** Chassis half-extents (x=half-width, y=half-height, z=half-length) — enter radius + seats. */
  halfExtents: Vec3;
  seats: SeatConfig[];
}

const frontSeats = (): SeatConfig[] => [
  { id: "driver", offset: { x: -0.42, y: 0.35, z: -0.15 }, exit: { x: -1.5, y: 0.1, z: -0.15 } },
  { id: "passenger", offset: { x: 0.42, y: 0.35, z: -0.15 }, exit: { x: 1.5, y: 0.1, z: -0.15 } },
];

export const SEDAN_SPEC: VehicleSpec = {
  id: VehicleId.Sedan,
  label: "Sedan",
  prefab: "sedan",
  maxHp: 1000,
  topSpeedKmh: 165,
  mass: 1350,
  halfExtents: { x: 0.9, y: 0.6, z: 2.2 },
  seats: frontSeats(),
};

const COUPE_SPEC: VehicleSpec = {
  id: VehicleId.Coupe,
  label: "Coupe",
  prefab: "sedan",
  maxHp: 850,
  topSpeedKmh: 215,
  mass: 1200,
  halfExtents: { x: 0.9, y: 0.55, z: 2.1 },
  seats: frontSeats(),
};

const SUV_SPEC: VehicleSpec = {
  id: VehicleId.Suv,
  label: "SUV",
  prefab: "sedan",
  maxHp: 1300,
  topSpeedKmh: 150,
  mass: 1900,
  halfExtents: { x: 1.0, y: 0.75, z: 2.4 },
  seats: frontSeats(),
};

const SPECS: Partial<Record<VehicleId, VehicleSpec>> = {
  [VehicleId.Sedan]: SEDAN_SPEC,
  [VehicleId.Coupe]: COUPE_SPEC,
  [VehicleId.Suv]: SUV_SPEC,
};

/** Spec lookup with a guaranteed sedan fallback (physics-agnostic gameplay data). */
export const getSpec = (id: VehicleId): VehicleSpec => SPECS[id] ?? SEDAN_SPEC;

export const getSeat = (spec: VehicleSpec, seat: SeatId): SeatConfig =>
  spec.seats.find((s) => s.id === seat) ?? spec.seats[0] ?? SEDAN_SPEC.seats[0]!;

// ── Enter / exit ────────────────────────────────────────────────────────────────────────
/** How close (planar metres) the on-foot player must be to a car to get the enter prompt. */
export const ENTER_RADIUS = 3.6;

// ── Driving assists ─────────────────────────────────────────────────────────────────────
/** Steer approach rate toward a larger magnitude (turning in) vs returning to centre. */
export const STEER_TURN_RATE = 9;
export const STEER_RETURN_RATE = 6;
/** Fraction of full steer authority remaining at/above top speed (speed-sensitive lock). */
export const STEER_LOCK_MIN = 0.35;
/** Below this |forward speed| the brake pedal engages reverse instead of braking. */
export const REVERSE_ENGAGE_KMH = 3;

// ── HUD ─────────────────────────────────────────────────────────────────────────────────
export const HUD_RATE_HZ = 12;
/** Approx rpm mapping for the reference speedometer (physics may publish a truer rpm). */
export const IDLE_RPM = 900;
export const MAX_RPM = 7000;

// ── Damage ──────────────────────────────────────────────────────────────────────────────
export const SMOKE_AT01 = 0.3; // emit smoke below 30% hp
export const FIRE_AT01 = 0.12; // emit fire below 12% hp
export const HIT_COOLDOWN_SEC = 0.08; // debounce contact-force damage
export const WRECK_DESPAWN_SEC = 12; // remove a wreck this long after it is destroyed
/** hp fraction above which the engine performs at 100%, and floor it degrades toward. */
export const ENGINE_HEALTHY_AT01 = 0.6;
export const ENGINE_FLOOR01 = 0.2;

// ── Spawning ────────────────────────────────────────────────────────────────────────────
/** Local net-id range for client-spawned vehicles (v4 server becomes authoritative). */
export const VG_NETID_BASE = 2_000_000;
/** Whether entering a car freezes the on-foot controller by flipping the player body to Fixed.
 *  Best-effort seam so the player doesn't walk off while "driving" before the integrator wires
 *  a proper PlayerController early-return on `vg_occupant`. Flip to false if it misbehaves. */
export const FREEZE_PLAYER_ON_ENTER = true;
