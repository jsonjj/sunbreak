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
  /** 0..1 accelerator (ground); also the plane's 0..1 engine throttle. */
  throttle: number;
  /** 0..1 dedicated braking (ground); also the boat's reverse. */
  brake: number;
  /** -1..1 (left..right) — ground steering, boat rudder. */
  steer: number;
  /** Rear-wheel handbrake (locks rear + drops rear grip for drifting); plane wheel-brake. */
  handbrake: boolean;
  /** Flip drive direction to backward (uses `reverseForce`). */
  reverse: boolean;

  // ─── Extended aircraft axes (optional; 0 when absent — ground vehicles ignore them) ───
  /** -1..1 nose down..up — aircraft elevator / helicopter cyclic (fore-aft). */
  pitch?: number;
  /** -1..1 roll left..right — aircraft aileron / helicopter cyclic (lateral). */
  roll?: number;
  /** -1..1 yaw left..right — aircraft rudder / helicopter tail rotor. */
  yaw?: number;
  /** 0..1 collective — helicopter vertical thrust (0.5 ≈ hover). Planes use `throttle`. */
  lift?: number;
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
  /** Any wheel currently touching the ground (aircraft: near ground / on a pad; boat: in water). */
  grounded: boolean;
  /** Number of wheels in contact this step (0..N; 0 for non-wheeled craft). */
  wheelsOnGround: number;
  /** Height above the local ground/water surface (m) — aircraft/boat telemetry (optional). */
  altitudeM?: number;
  /** True while an aircraft is off the ground (optional). */
  airborne?: boolean;
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

/**
 * Locomotion family. Decides which solver a vehicle uses:
 *   • `car` / `bike` → the Rapier raycast wheel controller (suspension + tire forces).
 *   • `heli` / `plane` → a dynamic rigid body driven by the arcade flight model (flight.ts).
 *   • `boat` → a dynamic rigid body driven by buoyancy + rudder (boat.ts).
 */
export type VehicleKind = "car" | "bike" | "heli" | "plane" | "boat";

/**
 * Arcade flight tuning (helicopter + fixed-wing). All forces are applied to the chassis body
 * inside the fixed physics step; none of the wheel/tire fields on {@link VehicleConfig} apply.
 */
export interface FlightConfig {
  /** Fixed-wing = true (thrust along nose + wing lift); false = rotor (collective along body-up). */
  fixedWing: boolean;
  /** Max engine/rotor thrust force (N). Heli: full-collective lift; plane: full-throttle thrust. */
  maxThrust: number;
  /** Heli only: collective (0..1) that exactly cancels gravity. 0.5 → mid-stick hovers. */
  hoverCollective: number;
  /** Plane only: wing-lift coefficient; F_up = liftCoeff · min(vFwd, liftSpeedCap)². */
  liftCoeff: number;
  /** Plane only: forward airspeed (m/s) at which lift ≈ weight (rotation / takeoff speed). */
  takeoffSpeed: number;
  /** Plane only: cap on the airspeed fed to the lift curve (keeps high-speed lift sane). */
  liftSpeedCap: number;
  /** Pitch (elevator/cyclic) control torque, N·m per unit input. */
  pitchTorque: number;
  /** Roll (aileron/cyclic) control torque. */
  rollTorque: number;
  /** Yaw (rudder/tail-rotor) control torque. */
  yawTorque: number;
  /** Plane only: airspeed (m/s) at which control surfaces reach full authority. */
  controlRefSpeed: number;
  /** Linear air drag (F = -k · v). */
  linearDrag: number;
  /** Angular drag (damps tumbling; higher = more stable/heavier controls). */
  angularDrag: number;
  /** Auto-level gain that rights the craft toward upright (arcade forgiveness). */
  levelAssist: number;
  /** Weather-vane gain that aligns velocity to the nose (plane keel / heli body). */
  headingAssist: number;
  /** Visual rotor/propeller spin rate at full power (rad/s). */
  rotorSpinRate: number;
}

/** Arcade watercraft tuning (buoyancy + planing + rudder). Applied in boat.ts each step. */
export interface BoatConfig {
  /** World Y of the water surface the hull floats at. */
  waterLevel: number;
  /** Forward thrust force at full throttle (N). */
  thrust: number;
  /** Reverse thrust force (N). */
  reverseThrust: number;
  /** Buoyancy stiffness — restoring force per metre submerged, in units of (mass · g). */
  buoyancy: number;
  /** Submersion depth (m) that develops full buoyancy (draft). */
  draft: number;
  /** Vertical velocity damping while in water (kills bob). */
  heaveDamp: number;
  /** Rudder yaw torque (scaled by forward speed). */
  steerTorque: number;
  /** Lateral (sideways) drag — the keel that stops sliding. */
  lateralDrag: number;
  /** Forward hydrodynamic drag. */
  forwardDrag: number;
  /** Roll induced into a turn (lean), rad per unit steer·speed. */
  turnBank: number;
  /** Self-righting torque toward upright. */
  levelAssist: number;
  /** Angular drag (pitch/roll/yaw stabilization in water). */
  angularDrag: number;
}

/** Full, data-driven handling profile for one vehicle class. */
export interface VehicleConfig {
  id: VehicleId | string;
  /** Locomotion family (default `"car"` when omitted). */
  kind?: VehicleKind;
  /** Arcade flight tuning — required for `heli` / `plane`, ignored otherwise. */
  flight?: FlightConfig;
  /** Arcade watercraft tuning — required for `boat`, ignored otherwise. */
  boat?: BoatConfig;
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
  pitch: 0,
  roll: 0,
  yaw: 0,
  lift: 0,
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
