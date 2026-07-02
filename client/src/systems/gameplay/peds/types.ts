// Local (subsystem-private) types for the PEDESTRIAN AI subsystem.
//
// These are NOT shared/networked contracts — they describe the internal ped sim, the nav
// abstraction, and the *structural* shapes we consume from sibling subsystems (city road-graph,
// combat damage events, traffic vehicle queries). Consuming structurally (duck-typed) keeps us
// decoupled from siblings that are still stubs during Wave-2: the integrator can pass City-Gen's
// real `MapDoc.roads` / traffic's `getVehiclesNear` straight in — they satisfy these shapes.

import type { PedArchetype } from "@sunbreak/shared";

/** Finite-state-machine states for an ambient ped. */
export type PedState =
  | "idle" // standing, cooling down before the next wander leg
  | "wander" // walking along the sidewalk graph toward a target node
  | "walk" // alias used by reactions; behaves like wander at walk speed
  | "flee" // running away from a threat toward a safe node
  | "panic" // very high fear: erratic sprint, spreads fear
  | "cower" // no safe route found: crouch/tremble in place
  | "dead"; // killed — instance hidden, ragdoll handoff emitted, awaiting pool release

/** Representation / simulation LOD tier (index matches config.LOD_TIERS). */
export type LodTier = 0 | 1 | 2 | 3; // L0 near · L1 mid · L2 far(round-robin) · Cull

/** Kind of perceived threat that raises ped fear. */
export type ThreatKind = "gunshot" | "explosion" | "vehicle" | "melee" | "panic";

/** A positional threat event. Peds within `radius` gain fear ∝ intensity·falloff and flee. */
export interface ThreatEvent {
  kind: ThreatKind;
  x: number;
  z: number;
  /** Effective radius in metres. */
  radius: number;
  /** 0..N fear magnitude at the epicentre (1 ≈ a nearby gunshot). */
  intensity: number;
  /** Optional source entity netId (so we don't scare the shooter, etc.). */
  sourceNetId?: number;
}

/**
 * Loose shape of a combat `DamageEvent` / `HitEvent`. Combat's bus payload varies across
 * versions; we resolve a world position from whatever is present (explicit point/origin, or an
 * ECS lookup of the referenced entity, or the player). See `perception.reportDamageEvent`.
 */
export interface DamageEventInput {
  kind?: ThreatKind;
  targetNetId?: number;
  byNetId?: number;
  sourceNetId?: number;
  amount?: number;
  damage?: number;
  lethal?: boolean;
  /** Any of these, if present, is used as the threat epicentre. */
  point?: [number, number, number] | { x: number; y?: number; z: number };
  position?: [number, number, number] | { x: number; y?: number; z: number };
  origin?: [number, number, number] | { x: number; y?: number; z: number };
  radius?: number;
  intensity?: number;
}

/** One sampled nearby vehicle (consumed from traffic's `getVehiclesNear`). */
export interface VehicleSample {
  x: number;
  z: number;
  /** Planar velocity (m/s); optional — used to bias avoidance ahead of the car. */
  vx?: number;
  vz?: number;
  /** Avoidance radius (car half-extent + margin); defaults applied if absent. */
  radius?: number;
}

/** Injected vehicle proximity query (traffic subsystem). */
export type VehicleQuery = (x: number, z: number, r: number) => VehicleSample[];

// ── City road-graph consumer contract ───────────────────────────────────────────────────────
// Structural match for City-Gen's `MapDoc.roads` (RoadGraph{nodes,edges}). Nodes are world-XZ;
// we accept either {x,z} objects, {x,y,z}, [x,z]/[x,y,z] tuples, or a packed Float32Array.

export interface RoadNodeXZ {
  x: number;
  z: number;
  y?: number;
}
export type RoadNodeInput = RoadNodeXZ | [number, number] | [number, number, number];

export interface RoadEdgeInput {
  a: number; // node index
  b: number; // node index
  /** Full carriageway width (m). Sidewalks are offset by width/2 + SIDEWALK_OFFSET. */
  width?: number;
  klass?: string; // 'arterial' | 'collector' | 'local' | …
  lanes?: number;
}

export interface RoadGraphInput {
  nodes: RoadNodeInput[] | Float32Array; // Float32Array = flat [x,z, x,z, …] or [x,y,z, …]
  edges: RoadEdgeInput[];
  /** If nodes is a Float32Array, stride tells us 2 (xz) or 3 (xyz). Defaults to auto-detect. */
  stride?: 2 | 3;
}

/**
 * The nav abstraction the whole ped sim talks to. Implemented by the fallback lattice grid AND
 * by the sidewalk graph derived from the city road-graph (and, later, a recast wrapper). A
 * "node" is an opaque integer id; positions are always world XZ.
 */
export interface NavProvider {
  /** Human label for debug/telemetry. */
  readonly kind: string;
  /** True once the provider can answer queries. */
  readonly ready: boolean;
  /** Total node count (∞ providers like the lattice may report Number.POSITIVE_INFINITY). */
  readonly nodeCount: number;
  /** Nearest walkable node to a world point (−1 if none). */
  nearestNode(x: number, z: number): number;
  /** Write node's world position into `out` (mutates + returns it). */
  nodePos(node: number, out: { x: number; z: number }): { x: number; z: number };
  /** Adjacent nodes. May return a reused array — copy if you need to retain it. */
  neighbors(node: number): number[];
  /** A random walkable node in the annulus [minR,maxR] around (x,z), or −1. */
  randomNodeAround(
    x: number,
    z: number,
    minR: number,
    maxR: number,
    rng: () => number,
  ): number;
  /** A reachable node biased away from (awayX,awayZ) ~`radius` out — for fleeing. */
  fleeNode(
    x: number,
    z: number,
    awayX: number,
    awayZ: number,
    radius: number,
    rng: () => number,
  ): number;
}

/** Death → ragdoll handoff payload written onto the dying ped (`ped_ragdoll`). */
export interface PedRagdollRequest {
  /** World impact point. */
  x: number;
  y: number;
  z: number;
  /** Normalised impulse direction. */
  dirX: number;
  dirY: number;
  dirZ: number;
  /** Impulse magnitude (N·s-ish; ragdoll scales it). */
  impulse: number;
  /** Struck bone hint for the ragdoll rig (e.g. 'chest','head'). */
  bone?: string;
  archetype: PedArchetype;
  /** performance.now() at death (ragdoll can linger/despawn on a timer). */
  at: number;
  handled?: boolean; // set true by the ragdoll subsystem once consumed
}

/**
 * Core per-ped simulation blob (one object, reused across pool acquire/release — never
 * reallocated, so hundreds of peds cost zero per-frame GC). Held on the ECS entity as
 * `ped_agent`. Position of record lives on the shared `transform` component; this blob holds the
 * kinematic/behaviour state around it.
 */
export interface PedAgent {
  archetype: PedArchetype;

  // navigation ------------------------------------------------------------------------------
  node: number; // current/nearest graph node
  target: number; // destination node (−1 = none)
  destX: number; // world position of the active waypoint
  destZ: number;

  // kinematics (planar) ---------------------------------------------------------------------
  vx: number;
  vz: number;
  speed: number; // current planar speed (m/s)
  maxSpeed: number; // baseline walk speed for this ped
  heading: number; // yaw (radians), atan2(vx, vz)-ish for facing

  // behaviour FSM ---------------------------------------------------------------------------
  state: PedState;
  stateT: number; // seconds spent in the current state (idle countdown, flee timer, …)

  // reactions -------------------------------------------------------------------------------
  fear: number; // 0..1
  fleeX: number; // last threat epicentre (flee away from here)
  fleeZ: number;
  calmCooldown: number; // seconds before a calmed ped resumes wandering

  // LOD / scheduling ------------------------------------------------------------------------
  lod: LodTier;
  tickPhase: number; // round-robin bucket for far (L2) temporal spreading
  dist2: number; // squared distance to the view focus (camera/player), for LOD + culling

  // rendering -------------------------------------------------------------------------------
  slot: number; // instance index within this archetype's InstancedMesh
  animPhase: number; // 0..1 procedural walk-cycle phase (bob/lean; VAT stand-in)

  // lifecycle -------------------------------------------------------------------------------
  age: number; // seconds alive
  deadAt: number; // performance.now() at death (0 = alive)
}
