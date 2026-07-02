// Tuning constants for traffic. Feel/perf knobs kept in one place. Sim timing mirrors the shared
// fixed-step contract (SIM_HZ = 30) so this stays deterministic and (v4) server-portable.
import { VehicleId } from "@sunbreak/shared";
import type { IdmParams, RoadClass } from "./types";

export { SIM_DT, SIM_HZ, MAX_SUBSTEPS } from "@sunbreak/shared";

// --- Spawn / despawn bubble (metres, around the camera/player) --------------------------------
export const SPAWN_INNER = 55; // don't spawn closer than this
export const SPAWN_OUTER = 150; // annulus outer edge (spawn ring)
export const DESPAWN_RADIUS = 210; // recycle beyond this (when off-screen)
export const SPAWN_HZ = 4; // spawn/despawn maintenance cadence
export const SPAWN_PER_TICK = 6; // max new cars per maintenance pass
export const COS_HALF_FOV = Math.cos((62 * Math.PI) / 180); // off-screen test half-angle

// --- LOD ring radii (distance to camera, metres) ---------------------------------------------
export const LOD0 = 30; // full sim + kinematic body
export const LOD1 = 72; // kinematic body, instanced
export const LOD2 = 132; // ECS-only, ~6 Hz round-robin
// beyond LOD2 → culled (invisible, minimal sim)
export const L2_TICK_SLICES = 5; // round-robin buckets for L2 temporal spreading

// --- Population caps per quality tier ---------------------------------------------------------
export const CAPS: Record<"low" | "medium" | "high", number> = { low: 40, medium: 90, high: 160 };
export const NEAR_PHYSICS_MAX = 36; // max pooled kinematic bodies (physics budget)

// --- Crash promotion --------------------------------------------------------------------------
export const CRASH_CLOSING_MS = 6.5; // relative closing speed that promotes a near car to dynamic
export const CRASH_DIST = 3.2; // metres from player at which we test for impact
export const WRECK_TTL = 9; // seconds a wreck lingers (as a lane obstacle) before recycling

// --- Geometry / kinematics --------------------------------------------------------------------
export const CAR_Y = 0.36; // body centre height above the road
export const CAR_LEN = 4.5;
export const CAR_WIDTH = 2.0;
export const LANE_WIDTH = 3.4; // default single-lane width when City-Gen omits it
export const GROUND_Y = 0.0; // lane centreline height
export const STUCK_LIMIT = 6; // seconds halted before the deadlock watchdog nudges a car

// --- Right-of-way -----------------------------------------------------------------------------
export const JUNCTION_BOX = 9; // metres from a lane end considered "in the junction"
export const STOP_LINE_SETBACK = 1.5; // metres before the node the stop line sits

// --- Signal timing (seconds) ------------------------------------------------------------------
export const GREEN_S = 8;
export const YELLOW_S = 2.2;

// --- Per-road-class defaults ------------------------------------------------------------------
export const CLASS_LANES: Record<RoadClass, number> = { highway: 3, avenue: 2, street: 1, alley: 1 };
export const CLASS_SPEED: Record<RoadClass, number> = {
  // m/s (~90 / 58 / 40 / 25 km/h)
  highway: 25,
  avenue: 16,
  street: 11,
  alley: 7,
};
export const CLASS_WIDTH: Record<RoadClass, number> = {
  highway: 3.6,
  avenue: 3.4,
  street: 3.2,
  alley: 3.0,
};

// --- IDM driver presets -----------------------------------------------------------------------
export const IDM_BASE: IdmParams = { v0: 12, T: 1.5, a: 1.6, b: 2.4, s0: 2.2, delta: 4 };
export const IDM_CAUTIOUS: IdmParams = { v0: 10, T: 1.9, a: 1.1, b: 2.0, s0: 2.6, delta: 4 };
export const IDM_AGGRO: IdmParams = { v0: 15, T: 1.1, a: 2.2, b: 3.0, s0: 1.8, delta: 4 };
export const ACCEL_CLAMP = 3.2; // clamp |a| to keep IDM from ringing

// --- Vehicle model palette (shared with vehicle-gameplay so a carjacked car keeps its model) ---
export interface CarClassDef {
  vehicleId: VehicleId;
  weight: number; // spawn probability weight
  length: number;
  width: number;
  topSpeed: number; // m/s cap on desired speed
  palette: number[]; // candidate body colours (hex)
}

export const CAR_CLASSES: CarClassDef[] = [
  {
    vehicleId: VehicleId.Sedan,
    weight: 5,
    length: 4.5,
    width: 1.95,
    topSpeed: 22,
    palette: [0xdfe3ea, 0x2b2f36, 0x8b95a6, 0x9c2b2b, 0x1f4e79, 0x3a6b53],
  },
  {
    vehicleId: VehicleId.Coupe,
    weight: 2,
    length: 4.3,
    width: 1.9,
    topSpeed: 26,
    palette: [0xc9a227, 0x111318, 0xb23b3b, 0xe8e8ea],
  },
  {
    vehicleId: VehicleId.Suv,
    weight: 3,
    length: 4.9,
    width: 2.05,
    topSpeed: 21,
    palette: [0x20242c, 0x545b68, 0xd7dbe2, 0x394b3a],
  },
  {
    vehicleId: VehicleId.Truck,
    weight: 1,
    length: 6.0,
    width: 2.25,
    topSpeed: 18,
    palette: [0x6a3d2b, 0x33414f, 0xb8bcc4],
  },
  {
    vehicleId: VehicleId.Sports,
    weight: 1,
    length: 4.2,
    width: 1.95,
    topSpeed: 30,
    palette: [0xd23b2f, 0xf2c218, 0x1c1f26, 0x2f6fb0],
  },
];

export const TOTAL_CAR_WEIGHT = CAR_CLASSES.reduce((s, c) => s + c.weight, 0);
