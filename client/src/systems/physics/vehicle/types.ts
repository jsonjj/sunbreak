// Public contract for the physics/vehicle subsystem.
//
// This is the single seam between vehicle-physics (owns the Rapier
// `DynamicRayCastVehicleController`, suspension, tire forces, arcade layer) and its
// consumers — chiefly gameplay/vehicle-gameplay, which authors *intent* (`DriverInput`)
// and reads *telemetry* (`VehicleState`) back. Keep this file dependency-light and stable.
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import type { Vec3Tuple, VehicleId } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";

// Live Rapier controller type derived from the (typed) RapierContext so we never take a hard
// dependency on `@dimforge/rapier3d-compat` — a transitive-only package (not a client dep).
export type RapierVehicleController = ReturnType<RapierContext["world"]["createVehicleController"]>;
export type { RapierRigidBody };

/**
 * Normalized driver intent. Written every frame by the gameplay layer (keyboard/gamepad +
 * assists) onto `entity.veh_input`; consumed by physics inside the fixed physics step.
 *
 * `throttle` is the accelerator in the *current* drive direction; set `reverse` to flip that
 * direction (uses `reverseForce`). `brake` is dedicated braking, always decelerating.
 */
export interface DriverInput {
  /** 0..1 accelerator. */
  throttle: number;
  /** 0..1 dedicated braking. */
  brake: number;
  /** -1..1 (left..right). */
  steer: number;
  /** Rear-wheel handbrake (locks rear + drops rear grip for drifting). */
  handbrake: boolean;
  /** Flip drive direction to backward (uses `reverseForce`). */
  reverse: boolean;
}

/** Telemetry published by physics onto `entity.veh_state` (read by HUD / audio / gameplay). */
export interface VehicleState {
  /** |forward speed| in km/h (for speedo). */
  speedKmh: number;
  /** Signed forward speed in m/s along chassis forward (negative = reversing). */
  forwardSpeed: number;
  /** 0..1 pseudo-RPM for engine audio + tach. */
  rpm01: number;
  /** Current gear (0 = reverse, 1..gears forward). */
  gear: number;
  /** 0..1 engine-force multiplier currently in effect (mirrors `veh_engineHealth`). */
  engineHealth: number;
  /** True while the drift state machine is engaged. */
  isDrifting: boolean;
  /** Accumulated drift score (missions / HUD). */
  driftScore: number;
  /** Any wheel currently touching the ground. */
  grounded: boolean;
  /** Number of wheels in contact this step (0..N). */
  wheelsOnGround: number;
}

/** Per-wheel raycast-suspension spec (chassis-local). */
export interface WheelSpec {
  /** Suspension connection point, chassis-local (top of the spring). */
  position: Vec3Tuple;
  radius: number;
  suspensionRestLength: number;
  suspensionStiffness: number;
  /** Damping while the spring compresses. */
  suspensionCompression: number;
  /** Damping while the spring relaxes. */
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  maxSuspensionForce: number;
  /** Longitudinal traction coefficient. */
  frictionSlip: number;
  /** Lateral grip multiplier. */
  sideFrictionStiffness: number;
  /** Front wheels steer. */
  steered: boolean;
  /** Driven wheels receive engine force. */
  driven: boolean;
  /** Wheels the handbrake locks. */
  handbrake: boolean;
}

/** Arcade layer applied on top of the raw raycast controller for a forgiving, fun feel. */
export interface VehicleArcadeConfig {
  /** Extra down-force coefficient; force = downforce * forwardSpeed² (grip at speed). */
  downforce: number;
  /** 0..1 fraction of lateral velocity killed per step at low speed (anti-slide). */
  gripAssist: number;
  /** m/s at which grip assist fades to zero (lets the car slide at speed). */
  gripFadeSpeed: number;
  /** Yaw torque coefficient while airborne. */
  airYaw: number;
  /** Pitch torque coefficient while airborne. */
  airPitch: number;
  /** Upright-assist gain (scaled by tilt² so it never fights gentle slopes). */
  antiRoll: number;
  /** Angular-velocity damping for the upright assist. */
  antiRollDamp: number;
  /** Rear frictionSlip multiplier while the handbrake is held (drift). */
  driftFrictionMul: number;
  /** Rear sideFrictionStiffness multiplier while the handbrake is held (drift). */
  driftSideMul: number;
  /** Slip angle (rad) to enter the drifting state. */
  driftEnterAngle: number;
  /** Slip angle (rad) to exit the drifting state (hysteresis). */
  driftExitAngle: number;
  /** Minimum planar speed (m/s) required to be considered drifting. */
  driftMinSpeed: number;
}

/** Full, data-driven handling profile for one vehicle class. */
export interface VehicleConfig {
  id: VehicleId | string;
  /** Chassis mass (kg). */
  mass: number;
  /** Chassis cuboid half-extents [x=half-width, y=half-height, z=half-length]. */
  chassisHalfExtents: Vec3Tuple;
  /** Center-of-mass offset (chassis-local); lower Y = harder to roll. */
  centerOfMassOffset: Vec3Tuple;
  linearDamping: number;
  angularDamping: number;
  /** Engine force per driven wheel (forward). */
  engineForce: number;
  /** Engine force per driven wheel (reverse). */
  reverseForce: number;
  /** Brake force per wheel. */
  brakeForce: number;
  /** Extra brake force on handbrake wheels. */
  handbrakeForce: number;
  /** Max steering angle (rad) at a standstill. */
  maxSteer: number;
  /** +1 or -1 to flip steering sense without touching gameplay. */
  steerSign: number;
  /** m/s reference for the speed-sensitive steer-lock falloff. */
  steerSpeedRef: number;
  /** 0..1 fraction of `maxSteer` retained at/above `steerSpeedRef`. */
  steerAtMaxSpeed: number;
  /** Damping rate for steering smoothing. */
  steerDampRate: number;
  /** Soft top speed (km/h); engine tapers past it. */
  topSpeedKmh: number;
  /** Number of forward gears (audio/HUD only). */
  gears: number;
  /** Wheels in a stable order: [FL, FR, RL, RR]. */
  wheels: WheelSpec[];
  arcade: VehicleArcadeConfig;
  /** Body paint color (hex). */
  color: string;
}

/**
 * A request to spawn a vehicle. Placed on an entity as `veh_spawnRequest` (by gameplay's
 * spawner, or via {@link spawnVehicle}); physics builds the chassis + wheels from it.
 */
export interface VehicleSpawnRequest {
  /** A preset id/name, or a fully-specified config. */
  spec: VehicleId | string | VehicleConfig;
  /** World spawn position. */
  position: Vec3Tuple;
  /** Optional spawn yaw (radians). Ignored if `quaternion` is given. */
  rotationY?: number;
  /** Optional spawn orientation quaternion [x,y,z,w]. */
  quaternion?: [number, number, number, number];
  /** Optional network identity to mirror into `entity.netId`. */
  netId?: number;
  /** Optional paint override. */
  color?: string;
}

/**
 * Stable handle to one spawned vehicle. Returned by {@link spawnVehicle} and retrievable via
 * {@link getVehicleHandle}. The façade is valid immediately; `chassis`/`controller` populate
 * once the R3F body mounts (await {@link VehicleHandle.ready} or poll {@link isReady}).
 *
 * Gameplay should drive through `setDriverInput` (or by writing `entity.veh_input`) and read
 * `getState()` — it must NOT call `controller.updateVehicle` itself; physics owns the step.
 */
export interface VehicleHandle {
  /** The backing ECS entity (identity in the miniplex world). */
  readonly entity: ClientEntity;
  /** Resolved handling profile. */
  readonly config: VehicleConfig;
  /** Chassis rigid body, or null until the body has mounted. */
  readonly chassis: RapierRigidBody | null;
  /** Raw raycast vehicle controller, or null until mounted. */
  readonly controller: RapierVehicleController | null;
  /** Network identity, if this vehicle has one. */
  readonly netId?: number;
  /** Resolves once `chassis` + `controller` are live. */
  readonly ready: Promise<VehicleHandle>;
  /** True once `chassis` + `controller` are live. */
  isReady(): boolean;
  /** Merge driver intent into `entity.veh_input` (physics applies it next step). */
  setDriverInput(input: Partial<DriverInput>): void;
  /** Latest published telemetry (the live `entity.veh_state`). */
  getState(): Readonly<VehicleState>;
  /** Set the 0..1 engine-force multiplier (damage coupling). */
  applyEngineHealth(h01: number): void;
  /** Un-flip and lift the car in place (flip-recovery / "reset vehicle"). */
  resetVehicle(): void;
  /** Despawn the vehicle and free its Rapier resources. */
  dispose(): void;
}

export const createEmptyDriverInput = (): DriverInput => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reverse: false,
});

export const createInitialVehicleState = (): VehicleState => ({
  speedKmh: 0,
  forwardSpeed: 0,
  rpm01: 0,
  gear: 1,
  engineHealth: 1,
  isDrifting: false,
  driftScore: 0,
  grounded: false,
  wheelsOnGround: 0,
});
