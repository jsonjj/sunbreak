// miniplex ECS component schema. Sim components are serializable POJOs so the exact same
// code can run headless on the (v4) server. View components (three/rapier handles) live on
// the client's ClientEntity — never here.
//
// EXTEND this type (add fields/tags); do NOT fork it. Other subsystems register components
// and systems against this contract.

import type { Transform, Vec3 } from "../types/math";
import type { PlayerInput } from "../types/input";
import type { CharacterId, PedArchetype, VehicleId, WeaponId } from "../types/entities";

export interface Velocity {
  linear: Vec3;
  angular: Vec3;
}

export type LocomotionMode = "idle" | "walk" | "run" | "sprint" | "crouch" | "jump" | "fall";

export interface Movement {
  speed: number; // m/s (planar)
  normalizedSpeed: number; // 0..1 across walk/run/sprint (for anim blend trees)
  mode: LocomotionMode;
  grounded: boolean;
  facing: number; // radians (visual yaw)
}

export interface Health {
  current: number;
  max: number;
  armor: number;
}

export interface VehicleComp {
  id: VehicleId;
  seats: number;
  occupants: number[]; // netIds
  engineOn: boolean;
  speedKmh: number;
}

export interface Seat {
  vehicleNetId: number;
  index: number;
}

export interface AI {
  behavior: "idle" | "wander" | "flee" | "drive" | "combat";
  targetNetId?: number;
}

export interface PedComp {
  archetype: PedArchetype;
}

export interface Spawn {
  prefab: "player" | "sedan" | "civilian" | "crate";
  modelUrl?: string;
}

/** Full set of simulation components. Entities hold a Partial of this. */
export interface SimComponents {
  transform: Transform;
  velocity: Velocity;
  input: PlayerInput;
  movement: Movement;
  health: Health;
  vehicle: VehicleComp;
  seat: Seat;
  ai: AI;
  ped: PedComp;
  spawn: Spawn;
  character: CharacterId;
  weapon: WeaponId;
  /** The ONLY cross-network identity. Never serialize object identity. */
  netId: number;

  // --- boolean tags (presence = true) ---
  isPlayer: true;
  isVehicle: true;
  isPed: true;
  isProp: true;
  isLocal: true;
  isRemote: true;
  isDead: true;
  isActive: true;
}
