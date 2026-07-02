// Local type contracts for the traffic subsystem.
//
// The traffic-ai plan wanted these in `shared/src/traffic.ts`, but the WAVE-2 protocol forbids
// touching `shared/**`, so every traffic type lives here in-folder instead. Cross-subsystem data
// (the City-Gen road graph) is consumed through a *structural* contract (`RoadGraphInput`) that we
// never import from another agent's in-flight folder — the integrator (or City-Gen) hands it to us
// at runtime via `provideRoadNetwork()`, and we fall back to a procedural grid when nothing is set.

import type { Transform, Vec3, VehicleId } from "@sunbreak/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Road graph INPUT — the loose contract we consume from City-Gen (render/city).
// Everything except node ids + positions is optional; we fill sane defaults per class.
// ─────────────────────────────────────────────────────────────────────────────
export type RoadClass = "highway" | "avenue" | "street" | "alley";

export interface RoadNode {
  id: number;
  x: number;
  z: number;
}

export interface RoadEdge {
  from: number; // RoadNode.id
  to: number; // RoadNode.id
  klass?: RoadClass;
  /** Total carriageway width in metres (both directions). Derived from `lanes` when absent. */
  width?: number;
  /** Lanes PER direction. Defaults by class. */
  lanes?: number;
  /** One-way edges only emit lanes in the from→to direction. */
  oneway?: boolean;
  /** Speed limit in m/s. Defaults by class. */
  speedLimit?: number;
}

export interface RoadGraphInput {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived DIRECTED lane graph — what the sim actually drives on.
// ─────────────────────────────────────────────────────────────────────────────
export interface Lane {
  id: number;
  from: number; // graph node id
  to: number; // graph node id
  /** Flattened xyz centreline samples (>= 2 vertices), already offset for right-hand traffic. */
  points: Float32Array;
  /** Cumulative arc length at each vertex (points.length / 3 entries). */
  cum: Float32Array;
  length: number;
  width: number; // single-lane width
  speedLimit: number; // m/s
  classId: RoadClass;
  /** Lane ids reachable when this lane ends (excludes the U-turn unless it's a dead-end). */
  successors: number[];
  /** Intersection controlling this lane's END node, or -1 when uncontrolled. */
  intersectionId: number;
  /** Cached midpoint (for spawn annulus + nearest-lane queries). */
  midX: number;
  midZ: number;
}

export type LightPhase = "green" | "yellow" | "red";

export interface Intersection {
  id: number;
  node: number;
  /** Groups of *incoming* lane ids that may proceed together (2-phase: cross-axes alternate). */
  groups: number[][];
  /** Index of the currently-served group. */
  phase: number;
  /** Seconds remaining in the current green (or yellow) window. */
  timer: number;
  yellow: boolean;
  greenDuration: number;
  yellowDuration: number;
  /** Set true this tick if a car currently occupies the junction box (right-of-way guard). */
  boxBusy: boolean;
  boxGroup: number; // which group owns the box this tick (-1 = free)
}

export interface LaneGraph {
  lanes: Lane[];
  nodes: RoadNode[];
  intersections: Intersection[];
  laneById: Map<number, Lane>;
  intersectionById: Map<number, Intersection>;
  /** node id → outgoing lane ids. */
  outLanes: Map<number, number[]>;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Intelligent Driver Model params (pure longitudinal car-following).
// ─────────────────────────────────────────────────────────────────────────────
export interface IdmParams {
  v0: number; // desired free-flow speed (m/s)
  T: number; // safe time headway (s)
  a: number; // max acceleration (m/s^2)
  b: number; // comfortable deceleration (m/s^2)
  s0: number; // minimum bumper gap (m)
  delta: number; // acceleration exponent
}

// ─────────────────────────────────────────────────────────────────────────────
// The `traffic_car` ECS component (attached to each ambient vehicle entity).
// ─────────────────────────────────────────────────────────────────────────────
export type CarState = "cruise" | "stopped" | "pullover" | "panic" | "wreck";
/** 0 = full sim + physics, 1 = kinematic body, 2 = ECS-only (round-robin), 3 = culled. */
export type CarLod = 0 | 1 | 2 | 3;

export interface TrafficCar {
  laneId: number;
  s: number; // arc length along current lane (m)
  speed: number; // m/s
  nextLane: number; // chosen successor lane id, or -1
  desiredSpeed: number; // effective free-flow speed (base v0, scaled by reactions)
  baseSpeed: number; // unmodified free-flow speed for this car
  driver: IdmParams;
  vehicleId: VehicleId;
  classId: RoadClass;
  length: number;
  width: number;
  lod: CarLod;
  state: CarState;
  colorHex: number;
  headingY: number; // yaw (radians)
  lateral: number; // current lateral offset from lane centre (m, +right)
  targetLateral: number;
  ignoreSignals: boolean; // panic runs some reds
  stuckT: number; // seconds halted (deadlock watchdog)
  wreckT: number; // seconds since promotion to a wreck
  tickPhase: number; // 0..N for L2 round-robin temporal spreading
  /** Rapier body handle when a near-car kinematic/dynamic body is attached. */
  rbHandle?: number;
  /** True once promoted to a dynamic rigid body on crash (physics owns the transform). */
  dynamic?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carjack handoff spec passed to vehicle-gameplay.
// ─────────────────────────────────────────────────────────────────────────────
export interface CarjackSpec {
  entityId: number | undefined;
  vehicleId: VehicleId;
  transform: Transform;
  velocity: Vec3;
  colorHex: number;
  classId: RoadClass;
  speedKmh: number;
}

// Event bus payloads (mitt). The `& Record<PropertyKey, unknown>` satisfies mitt's
// `Record<EventType, unknown>` constraint while keeping precise payload types for the known keys.
export type TrafficEventMap = {
  honk: { x: number; z: number };
  crash: { x: number; z: number; speed: number };
  carjack: CarjackSpec;
  graphReady: {
    lanes: number;
    intersections: number;
    source: "provided" | "discovered" | "procedural";
  };
} & Record<PropertyKey, unknown>;
