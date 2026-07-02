// Data-driven handling profiles per vehicle class. Numbers are tuned for an arcade-leaning,
// forgiving feel on a flat test ground at a fixed 1/60 step; treat them as a starting point.
// All feel constants live here so they're fast to iterate and (v4) identical on the server.
import { VehicleId } from "@sunbreak/shared";
import type { Vec3Tuple } from "@sunbreak/shared";
import type { VehicleArcadeConfig, VehicleConfig, WheelSpec } from "./types";

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
  engineForce: 3800,
  reverseForce: 1900,
  brakeForce: 2400,
  handbrakeForce: 3600,
  maxSteer: 0.55,
  steerSign: 1,
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

export const VEHICLE_PRESETS: Record<VehicleId, VehicleConfig> = {
  [VehicleId.Sedan]: SEDAN,
  [VehicleId.Coupe]: COUPE,
  [VehicleId.Suv]: SUV,
  [VehicleId.Truck]: TRUCK,
  [VehicleId.Sports]: SPORTS,
  [VehicleId.Police]: POLICE,
};

/** The default config used when a spec can't be resolved. */
export const DEFAULT_VEHICLE_CONFIG = SEDAN;

const isVehicleConfig = (v: unknown): v is VehicleConfig =>
  typeof v === "object" && v !== null && "wheels" in v && "chassisHalfExtents" in v;

/**
 * Resolve a spawn `spec` (a preset id/name or a full config) to a concrete, owned
 * `VehicleConfig`. Always returns a fresh object so per-vehicle tweaks never mutate a preset.
 */
export function resolveVehicleConfig(
  spec: VehicleId | string | VehicleConfig,
  colorOverride?: string,
): VehicleConfig {
  if (isVehicleConfig(spec)) {
    return derive(spec, colorOverride ? { color: colorOverride } : {});
  }
  const preset = VEHICLE_PRESETS[spec as VehicleId] ?? DEFAULT_VEHICLE_CONFIG;
  return derive(preset, colorOverride ? { color: colorOverride } : {});
}
