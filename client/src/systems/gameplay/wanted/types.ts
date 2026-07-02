// Wanted/Police-AI type contracts (client-local; the spec locates these in
// `shared/src/wanted/types.ts`, but Wave-2 file-ownership keeps them in this folder and
// re-exports them from `index.ts`). Everything here is a serializable POJO so the same shapes
// can be promoted to `@sunbreak/shared` + a v4 Colyseus schema without change.
import type { Vec3 } from "@sunbreak/shared";

/** Discrete crimes that draw police attention (only if witnessed / heard). */
export type WantedCrimeType =
  | "brandish"
  | "fistfight"
  | "recklessDrive"
  | "hitPed"
  | "vehicleTheft"
  | "gunfire"
  | "civilianKilled"
  | "officerAttacked"
  | "officerKilled"
  | "explosion";

/** Per-unit tactical role assigned by the Dispatch Director. */
export type PoliceRole = "pursuer" | "blocker" | "spotter" | "searcher";

/** Unit body/archetype. `foot` reuses the ped pattern; the rest reuse the vehicle pattern. */
export type UnitArchetype = "cruiser" | "foot" | "unmarked" | "srtVan";

/** Original-IP agencies (no Rockstar names). */
export type Agency = "SVPD" | "VSP" | "SRT";

/** Plain-FSM pursuit states (no behavior-tree middleware). */
export type CopState = "PATROL" | "PURSUE" | "SEARCH" | "RETURN";

/** Who/what took the hit — decides civilian vs. officer heat. */
export type VictimKind = "civilian" | "police" | "player" | "vehicle" | "prop";

export interface VehicleDescriptor {
  model: string;
  color: string;
  plate: string;
}

/** The suspect the police are hunting. v3 disguise/respray "outs" decay `faceConfidence`. */
export interface SuspectProfile {
  faceConfidence: number; // 0..1
  outfitId: string;
  vehicleDescriptor: VehicleDescriptor | null;
}

/** A crime signal published to the crime bus by any producer (combat/vehicles/player). */
export interface CrimeEvent {
  type: WantedCrimeType;
  position: Vec3;
  /** netId of the perpetrator; the player's netId means it counts against the player. */
  actorNetId?: number;
  /** override audible radius in metres (defaults to the tuning table for the crime). */
  loudness?: number;
}

/** Generic "damage" signal (the shared damage event) → mapped to a crime by `reportDamage`. */
export interface DamageEvent {
  attackerNetId?: number;
  victimNetId?: number;
  victimKind?: VictimKind;
  amount: number;
  position: Vec3;
  weapon?: string;
  melee?: boolean;
}

/** Generic "death" signal (the shared death event) → mapped to a crime by `reportDeath`. */
export interface DeathEvent {
  killerNetId?: number;
  victimNetId?: number;
  victimKind?: VictimKind;
  position: Vec3;
  weapon?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ECS component payloads (attached under the `wanted_*` keys — see wanted.components.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface WantedPolice {
  archetype: UnitArchetype;
  role: PoliceRole;
  agency: Agency;
  fsm: CopState;
  /** sim-seconds the unit was deployed (for despawn/stuck heuristics). */
  spawnedAt: number;
}

export interface WantedPerception {
  fovDeg: number;
  range: number;
  hearRange: number;
  /** sim-seconds of the last confirmed sight/hearing of the suspect (-Infinity = never). */
  lastSeenAt: number;
}

export interface WantedPursuit {
  targetNetId: number;
  speed: number; // m/s
  desiredDist: number; // stand-off distance in metres
}

export interface WantedSearch {
  lkpX: number;
  lkpZ: number;
  timer: number;
  pointX: number;
  pointZ: number;
}
