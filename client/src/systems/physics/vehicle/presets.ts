// Data-driven handling profiles per vehicle class. Numbers are tuned for an arcade-leaning,
// forgiving feel on a flat test ground at a fixed 1/60 step; treat them as a starting point.
// All feel constants live here so they're fast to iterate and (v4) identical on the server.
import { VehicleId } from "@sunbreak/shared";
import type { Vec3Tuple } from "@sunbreak/shared";
import { WATER_LEVEL } from "@/systems/render/city/geography";
import type {
  BoatConfig,
  FlightConfig,
  VehicleArcadeConfig,
  VehicleConfig,
  WheelSpec,
} from "./types";

const DEFAULT_ARCADE: VehicleArcadeConfig = {
  downforce: 6,
  gripAssist: 0.2,
  gripFadeSpeed: 22,
  airYaw: 3200,
  airPitch: 2200,
  antiRoll: 18,
  antiRollDamp: 2.5,
  driftFrictionMul: 0.55,
  driftSideMul: 0.5,
  driftEnterAngle: 0.35, // ~20°
  driftExitAngle: 0.18, // ~10°
  driftMinSpeed: 6,
};

interface WheelLayout {
  /** Half track width (X): distance from center to each wheel. */
  halfTrack: number;
  /** Front axle Z (+forward). */
  frontZ: number;
  /** Rear axle Z (-forward). */
  rearZ: number;
  /** Connection-point Y (chassis-local; top of the spring, usually slightly below center). */
  connectionY: number;
  radius: number;
  restLength: number;
  stiffness: number;
  compression: number;
  relaxation: number;
  maxTravel: number;
  maxForce: number;
  frontFriction: number;
  rearFriction: number;
  sideFriction: number;
  /** true = FWD (front driven), false = RWD (rear driven). */
  fwd?: boolean;
}

/** Build a stable [FL, FR, RL, RR] wheel set from a symmetric layout. */
function makeWheels(l: WheelLayout): WheelSpec[] {
  const common = {
    radius: l.radius,
    suspensionRestLength: l.restLength,
    suspensionStiffness: l.stiffness,
    suspensionCompression: l.compression,
    suspensionRelaxation: l.relaxation,
    maxSuspensionTravel: l.maxTravel,
    maxSuspensionForce: l.maxForce,
    sideFrictionStiffness: l.sideFriction,
  } satisfies Partial<WheelSpec>;
  const rearDriven = !l.fwd;
  const frontDriven = !!l.fwd;
  const mk = (
    x: number,
    z: number,
    steered: boolean,
    driven: boolean,
    handbrake: boolean,
    friction: number,
  ): WheelSpec => ({
    ...common,
    position: [x, l.connectionY, z] as Vec3Tuple,
    frictionSlip: friction,
    steered,
    driven,
    handbrake,
  });
  return [
    mk(-l.halfTrack, l.frontZ, true, frontDriven, false, l.frontFriction), // FL
    mk(l.halfTrack, l.frontZ, true, frontDriven, false, l.frontFriction), // FR
    mk(-l.halfTrack, l.rearZ, false, rearDriven, true, l.rearFriction), // RL
    mk(l.halfTrack, l.rearZ, false, rearDriven, true, l.rearFriction), // RR
  ];
}

/** Principal angular inertia of a solid cuboid (full dims), used for chassis mass properties. */
export function computeChassisInertia(mass: number, half: Vec3Tuple): Vec3Tuple {
  const [hx, hy, hz] = half;
  const k = mass / 3;
  return [k * (hy * hy + hz * hz), k * (hx * hx + hz * hz), k * (hx * hx + hy * hy)];
}

const SEDAN: VehicleConfig = {
  id: VehicleId.Sedan,
  mass: 1250,
  chassisHalfExtents: [0.9, 0.5, 2.1],
  centerOfMassOffset: [0, -0.4, 0],
  linearDamping: 0.05,
  angularDamping: 0.6,
  engineForce: 4200,
  reverseForce: 2200,
  brakeForce: 2600,
  handbrakeForce: 3600,
  maxSteer: 0.55,
  // -1 because the chassis drives nose-forward along +Z (see AXLE note in useVehicleController):
  // a positive steer input (D / right) must curve the car toward its own right, which is -X for a
  // +Z-facing car, so the wheel steer angle is negated here. Propagates to every derived preset.
  steerSign: -1,
  steerSpeedRef: 28,
  steerAtMaxSpeed: 0.22,
  steerDampRate: 9,
  topSpeedKmh: 180,
  gears: 5,
  wheels: makeWheels({
    halfTrack: 0.85,
    frontZ: 1.45,
    rearZ: -1.45,
    connectionY: -0.25,
    radius: 0.36,
    restLength: 0.35,
    stiffness: 24,
    compression: 0.82,
    relaxation: 0.88,
    maxTravel: 0.28,
    maxForce: 60000,
    frontFriction: 1.9,
    rearFriction: 2.0,
    sideFriction: 0.9,
  }),
  arcade: { ...DEFAULT_ARCADE },
  color: "#3b6ea5",
};

/** Config override where `arcade` may be a partial (merged onto the base arcade). */
type ConfigOverride = Omit<Partial<VehicleConfig>, "arcade"> & {
  arcade?: Partial<VehicleArcadeConfig>;
};

/** Shallow-clone a config with overrides (wheels replaced wholesale when provided). */
function derive(base: VehicleConfig, over: ConfigOverride): VehicleConfig {
  return {
    ...base,
    ...over,
    arcade: { ...base.arcade, ...(over.arcade ?? {}) },
    wheels: over.wheels ?? base.wheels.map((w) => ({ ...w })),
  };
}

const COUPE = derive(SEDAN, {
  id: VehicleId.Coupe,
  mass: 1150,
  chassisHalfExtents: [0.88, 0.46, 2.0],
  engineForce: 4200,
  topSpeedKmh: 200,
  steerAtMaxSpeed: 0.26,
  color: "#b5423a",
  wheels: makeWheels({
    halfTrack: 0.85,
    frontZ: 1.38,
    rearZ: -1.38,
    connectionY: -0.22,
    radius: 0.35,
    restLength: 0.32,
    stiffness: 26,
    compression: 0.84,
    relaxation: 0.9,
    maxTravel: 0.24,
    maxForce: 60000,
    frontFriction: 2.0,
    rearFriction: 2.1,
    sideFriction: 0.95,
  }),
});

const SPORTS = derive(SEDAN, {
  id: VehicleId.Sports,
  mass: 1050,
  chassisHalfExtents: [0.92, 0.42, 2.05],
  centerOfMassOffset: [0, -0.45, 0],
  engineForce: 5200,
  reverseForce: 2200,
  brakeForce: 3000,
  topSpeedKmh: 235,
  maxSteer: 0.5,
  steerAtMaxSpeed: 0.3,
  steerDampRate: 11,
  color: "#d1b24a",
  arcade: { downforce: 9, gripAssist: 0.28, gripFadeSpeed: 26 },
  wheels: makeWheels({
    halfTrack: 0.9,
    frontZ: 1.4,
    rearZ: -1.4,
    connectionY: -0.2,
    radius: 0.35,
    restLength: 0.3,
    stiffness: 30,
    compression: 0.86,
    relaxation: 0.92,
    maxTravel: 0.22,
    maxForce: 65000,
    frontFriction: 2.2,
    rearFriction: 2.3,
    sideFriction: 1.05,
  }),
});

const SUV = derive(SEDAN, {
  id: VehicleId.Suv,
  mass: 1750,
  chassisHalfExtents: [1.0, 0.7, 2.3],
  centerOfMassOffset: [0, -0.5, 0],
  engineForce: 4200,
  reverseForce: 2100,
  brakeForce: 2600,
  handbrakeForce: 4000,
  maxSteer: 0.52,
  steerAtMaxSpeed: 0.2,
  topSpeedKmh: 165,
  color: "#4a5d4f",
  arcade: { downforce: 5, gripAssist: 0.3, antiRoll: 34 },
  wheels: makeWheels({
    halfTrack: 0.95,
    frontZ: 1.55,
    rearZ: -1.55,
    connectionY: -0.28,
    radius: 0.42,
    restLength: 0.42,
    stiffness: 22,
    compression: 0.8,
    relaxation: 0.86,
    maxTravel: 0.34,
    maxForce: 80000,
    frontFriction: 1.9,
    rearFriction: 2.0,
    sideFriction: 0.85,
  }),
});

const TRUCK = derive(SEDAN, {
  id: VehicleId.Truck,
  mass: 2600,
  chassisHalfExtents: [1.1, 0.8, 2.9],
  centerOfMassOffset: [0, -0.55, 0],
  engineForce: 5200,
  reverseForce: 2600,
  brakeForce: 3200,
  handbrakeForce: 4600,
  maxSteer: 0.48,
  steerAtMaxSpeed: 0.18,
  steerDampRate: 7,
  topSpeedKmh: 150,
  gears: 6,
  color: "#6b5b45",
  arcade: { downforce: 4, gripAssist: 0.28, antiRoll: 40 },
  wheels: makeWheels({
    halfTrack: 1.02,
    frontZ: 1.9,
    rearZ: -1.9,
    connectionY: -0.34,
    radius: 0.5,
    restLength: 0.46,
    stiffness: 22,
    compression: 0.78,
    relaxation: 0.84,
    maxTravel: 0.38,
    maxForce: 110000,
    frontFriction: 1.85,
    rearFriction: 2.0,
    sideFriction: 0.8,
  }),
});

const POLICE = derive(SEDAN, {
  id: VehicleId.Police,
  mass: 1300,
  engineForce: 4400,
  brakeForce: 2700,
  topSpeedKmh: 195,
  steerAtMaxSpeed: 0.26,
  color: "#26303f",
  arcade: { downforce: 8, gripAssist: 0.36 },
});

// ─── Extended roster (string ids the shared VehicleId enum doesn't cover) ────────────────────
/** Ids for craft outside the shared VehicleId enum. `VehicleConfig.id` accepts strings. */
export const ExtVehicleId = {
  Motorcycle: "motorcycle",
  Helicopter: "helicopter",
  Plane: "plane",
  Boat: "boat",
} as const;
export type ExtVehicleId = (typeof ExtVehicleId)[keyof typeof ExtVehicleId];

/**
 * Motorcycle — light, punchy, agile, low-grip (wheelie/slide-prone). Uses the proven raycast car
 * solver with a deliberately NARROW 4-wheel stance (paired close on each axle) so it's statically
 * stable + never wobbles at rest, while reading as a two-wheeler with the bike body + a firm
 * upright assist. RWD. `kind: "bike"` selects the motorcycle body + bike handling branch.
 */
const MOTORCYCLE: VehicleConfig = derive(SEDAN, {
  id: ExtVehicleId.Motorcycle,
  kind: "bike",
  mass: 260,
  chassisHalfExtents: [0.32, 0.42, 1.05],
  centerOfMassOffset: [0, -0.34, 0],
  linearDamping: 0.05,
  angularDamping: 0.7,
  engineForce: 2600,
  reverseForce: 900,
  brakeForce: 1500,
  handbrakeForce: 1600,
  maxSteer: 0.6,
  steerSpeedRef: 24,
  steerAtMaxSpeed: 0.3,
  steerDampRate: 12,
  topSpeedKmh: 205,
  gears: 6,
  color: "#d24a2c",
  arcade: {
    downforce: 3,
    gripAssist: 0.34,
    gripFadeSpeed: 22,
    antiRoll: 46, // firm upright bias so it leans but never falls over
    antiRollDamp: 5,
    driftFrictionMul: 0.7,
    driftSideMul: 0.7,
  },
  wheels: makeWheels({
    halfTrack: 0.32,
    frontZ: 0.82,
    rearZ: -0.82,
    connectionY: -0.14,
    radius: 0.35,
    restLength: 0.26,
    stiffness: 26,
    compression: 0.85,
    relaxation: 0.9,
    maxTravel: 0.2,
    maxForce: 16000,
    frontFriction: 2.0,
    rearFriction: 2.2,
    sideFriction: 1.25,
  }),
});

/** Base for non-wheeled craft (aircraft/boat): fills the wheel-solver fields with inert defaults. */
function craftBase(id: string, over: Partial<VehicleConfig>): VehicleConfig {
  return {
    id,
    mass: 1200,
    chassisHalfExtents: [1, 1, 2],
    centerOfMassOffset: [0, -0.3, 0],
    linearDamping: 0.1,
    angularDamping: 1.5,
    engineForce: 0,
    reverseForce: 0,
    brakeForce: 0,
    handbrakeForce: 0,
    maxSteer: 0,
    steerSign: -1,
    steerSpeedRef: 20,
    steerAtMaxSpeed: 0.3,
    steerDampRate: 8,
    topSpeedKmh: 200,
    gears: 1,
    wheels: [],
    arcade: { ...DEFAULT_ARCADE },
    color: "#cccccc",
    ...over,
  };
}

const HELI_FLIGHT: FlightConfig = {
  fixedWing: false,
  maxThrust: 48000, // ≈ 2.2 × weight → strong climb authority
  hoverCollective: 0.45, // mass·g / maxThrust
  liftCoeff: 0,
  takeoffSpeed: 0,
  liftSpeedCap: 0,
  pitchTorque: 12000,
  rollTorque: 7000,
  yawTorque: 9000,
  controlRefSpeed: 1, // full control authority regardless of airspeed
  linearDrag: 0, // horizontal drag comes from body linearDamping (see config below)
  angularDrag: 0,
  levelAssist: 2.4, // auto-levels toward upright when cyclic is neutral
  headingAssist: 0.6, // damps sideways drift so it isn't too floaty
  rotorSpinRate: 42,
};

const HELICOPTER: VehicleConfig = craftBase(ExtVehicleId.Helicopter, {
  kind: "heli",
  mass: 2200,
  chassisHalfExtents: [1.1, 1.1, 2.4],
  centerOfMassOffset: [0, -0.55, 0],
  linearDamping: 0.12, // gentle: ~28 m/s cruise at a 20° tilt
  angularDamping: 3.0, // heavy, stable, controllable rotation
  topSpeedKmh: 240,
  color: "#2f3d4d",
  flight: HELI_FLIGHT,
});

const PLANE_FLIGHT: FlightConfig = {
  fixedWing: true,
  maxThrust: 9000, // ~6.4 m/s² → ~90 m/s top with the drag below
  hoverCollective: 0,
  liftCoeff: 15, // F_up = 15·min(vFwd, cap)²  → lift ≈ weight at takeoffSpeed
  takeoffSpeed: 30,
  liftSpeedCap: 62,
  pitchTorque: 12000,
  rollTorque: 4000,
  yawTorque: 6000,
  controlRefSpeed: 45, // control surfaces reach full authority at 45 m/s
  linearDrag: 0, // drag comes from body linearDamping (caps top speed ~90 m/s)
  angularDrag: 0,
  levelAssist: 0.8, // gentle wing-leveler; mostly stays where you put it
  headingAssist: 1.3, // wings/keel: strongly resists sideslip, flies where it points
  rotorSpinRate: 130,
};

const PLANE: VehicleConfig = craftBase(ExtVehicleId.Plane, {
  kind: "plane",
  mass: 1400,
  chassisHalfExtents: [0.9, 0.8, 3.4],
  centerOfMassOffset: [0, -0.2, 0],
  linearDamping: 0.07, // ~90 m/s (~320 km/h) terminal at full throttle
  angularDamping: 1.2,
  topSpeedKmh: 320,
  color: "#d7dae0",
  flight: PLANE_FLIGHT,
});

const BOAT_CFG: BoatConfig = {
  waterLevel: WATER_LEVEL, // island sea surface (geography.WATER_LEVEL = -1.2)
  thrust: 16000,
  reverseThrust: 8000,
  buoyancy: 2.5, // max upthrust as a multiple of weight (fully submerged pops up)
  draft: 0.7, // floats with COM ~0.7 m below the surface
  heaveDamp: 2.6,
  steerTorque: 9000,
  lateralDrag: 3.2, // keel — kills sideways slip (rate 1/s)
  forwardDrag: 0.4, // hull drag (rate 1/s)
  turnBank: 0.16,
  levelAssist: 3.2,
  angularDrag: 0,
};

const BOAT: VehicleConfig = craftBase(ExtVehicleId.Boat, {
  kind: "boat",
  mass: 1200,
  chassisHalfExtents: [1.35, 0.7, 3.2],
  centerOfMassOffset: [0, -0.45, 0],
  linearDamping: 0.0, // horizontal drag handled in boat.ts; buoyancy handles vertical
  angularDamping: 2.2,
  topSpeedKmh: 120,
  color: "#c94a3a",
  boat: BOAT_CFG,
});

export const VEHICLE_PRESETS: Record<VehicleId, VehicleConfig> = {
  [VehicleId.Sedan]: SEDAN,
  [VehicleId.Coupe]: COUPE,
  [VehicleId.Suv]: SUV,
  [VehicleId.Truck]: TRUCK,
  [VehicleId.Sports]: SPORTS,
  [VehicleId.Police]: POLICE,
};

/** Presets for the extended roster (motorcycle + aircraft + watercraft), keyed by string id. */
export const EXTENDED_PRESETS: Record<string, VehicleConfig> = {
  [ExtVehicleId.Motorcycle]: MOTORCYCLE,
  [ExtVehicleId.Helicopter]: HELICOPTER,
  [ExtVehicleId.Plane]: PLANE,
  [ExtVehicleId.Boat]: BOAT,
};

/** Every preset (enum + extended) by string key — handy for spawners / catalogs. */
export const ALL_VEHICLE_PRESETS: Record<string, VehicleConfig> = {
  ...VEHICLE_PRESETS,
  ...EXTENDED_PRESETS,
};

/** The default config used when a spec can't be resolved. */
export const DEFAULT_VEHICLE_CONFIG = SEDAN;

const isVehicleConfig = (v: unknown): v is VehicleConfig =>
  typeof v === "object" && v !== null && "wheels" in v && "chassisHalfExtents" in v;

/**
 * Resolve a spawn `spec` (a preset id/name or a full config) to a concrete, owned
 * `VehicleConfig`. Always returns a fresh object so per-vehicle tweaks never mutate a preset.
 * Checks the enum presets first, then the extended (string) roster, else falls back to sedan.
 */
export function resolveVehicleConfig(
  spec: VehicleId | string | VehicleConfig,
  colorOverride?: string,
): VehicleConfig {
  if (isVehicleConfig(spec)) {
    return derive(spec, colorOverride ? { color: colorOverride } : {});
  }
  const preset =
    VEHICLE_PRESETS[spec as VehicleId] ?? EXTENDED_PRESETS[spec] ?? DEFAULT_VEHICLE_CONFIG;
  return derive(preset, colorOverride ? { color: colorOverride } : {});
}

/** Locomotion family for a resolved config (default `"car"`). */
export const kindOf = (cfg: VehicleConfig): NonNullable<VehicleConfig["kind"]> => cfg.kind ?? "car";
