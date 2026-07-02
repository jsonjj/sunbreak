// miniplex ECS component schema. Sim components are serializable POJOs so the exact same
// code can run headless on the (v4) server. View components (three/rapier handles) live on
// the client's ClientEntity — never here.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTEND, DON'T FORK — the Wave-2 ECS augmentation contract
// ─────────────────────────────────────────────────────────────────────────────
// `SimComponents` is intentionally an *augmentable* interface. A subsystem adds its own
// components from a file INSIDE ITS OWN FOLDER via TypeScript declaration merging — it must
// NEVER edit this file. Augmentations flow automatically into `SimEntity` (= Partial<
// SimComponents>) and, on the client, into `ClientEntity` (= SimEntity & view components).
//
// Pattern (put this in e.g. client/src/systems/gameplay/combat/combat.components.ts):
//
//     import type { WeaponId } from "@sunbreak/shared";   // any real import → file is a module
//     declare module "@sunbreak/shared" {
//       interface SimComponents {
//         combat_ammo?: number;        // data field
//         combat_weapon?: WeaponId;
//         combat_reloading?: true;     // boolean tag (presence = true)
//       }
//     }
//
// RULES:
//  1. Prefix EVERY field with your subsystem's name to avoid collisions across ~40 agents:
//     vehicle_*, combat_*, ped_*, traffic_*, wanted_*, mission_*, econ_*, radio_*, …
//  2. The augmenting file MUST be a module (have a top-level `import`/`export`). A file that
//     contains ONLY `declare module` with no import/export becomes a module *replacement* and
//     will break every shared type — always keep an `import type … from "@sunbreak/shared"`
//     (or a trailing `export {};`).
//  3. Make new fields optional (`?`) or a presence-tag (`: true`) — every entity holds only a
//     Partial of these components.
//  4. Keep sim components serializable POJOs (numbers/strings/enums/plain objects). Live
//     object refs (THREE/Rapier handles) are client-only view components — see ClientEntity.

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
