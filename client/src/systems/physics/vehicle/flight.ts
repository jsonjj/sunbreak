// Arcade flight model for helicopters + fixed-wing planes. Runs inside the fixed physics step
// (before the solver, from useDynamicVehicleController) and applies thrust/lift + control
// torques + stabilization directly to the chassis rigid body. Zero per-frame allocation — all
// scratch is module-level. Numbers live in each preset's `flight` block (see presets.ts).
//
// Body frame convention (matches the wheeled chassis): nose = +Z, up = +Y, right = +X.
//   • Helicopter: collective (input.lift 0..1) → thrust along BODY-up. Tilt the body to move —
//     tilting trades vertical lift for horizontal thrust, exactly like a real heli.
//   • Plane: throttle (input.throttle 0..1) → thrust along BODY-forward; wing lift ∝ airspeed²
//     along body-up (so it must build speed to take off, and stalls/sinks when too slow).
// Control axes: input.pitch/roll/yaw are all -1..1 (elevator/aileron/rudder or cyclic/tail).
import * as THREE from "three";
import { GRAVITY } from "@sunbreak/shared";
import { FLIGHT_CEILING } from "@/systems/render/city/geography";
import type { DriverInput } from "./types";
import type { VehicleHandleImpl } from "./runtime";

/** Metres above the soft ceiling over which thrust/lift fade to zero (before the hard ceiling). */
const CEILING_FADE_M = 32;

const G = Math.abs(GRAVITY[1]); // 9.81 m/s²

const EMPTY: DriverInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reverse: false,
};

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _v = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _tq = new THREE.Vector3();
const _cross = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampAxis = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * Apply one step of arcade flight forces to a heli/plane chassis. Call from
 * `useBeforePhysicsStep`. No-op unless the config carries a `flight` block.
 */
export function applyFlightStep(handle: VehicleHandleImpl, dt: number): void {
  const chassis = handle.chassis;
  const cfg = handle.config;
  const f = cfg.flight;
  if (!chassis || !f) return;

  const input = handle.entity.veh_input ?? EMPTY;
  const engineHealth = clamp01(handle.entity.veh_engineHealth ?? 1);

  const r = chassis.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  _up.set(0, 1, 0).applyQuaternion(_q);
  _fwd.set(0, 0, 1).applyQuaternion(_q);
  _right.set(1, 0, 0).applyQuaternion(_q);

  const lin = chassis.linvel();
  _v.set(lin.x, lin.y, lin.z);
  const speed = _v.length();
  const fwdSpeed = _v.dot(_fwd);
  const mass = chassis.mass() || cfg.mass;

  const pitch = clampAxis(input.pitch ?? 0);
  const roll = clampAxis(input.roll ?? 0);
  const yaw = clampAxis(input.yaw ?? 0);

  // ── Soft flight ceiling (turn-back) ────────────────────────────────────────────────────────
  // Above FLIGHT_CEILING, fade thrust/lift to zero over CEILING_FADE_M and add a gentle downward
  // pull, so craft ease back down BEFORE hitting the hard ceiling collider (FLIGHT_HARD_CEILING).
  const altY = chassis.translation().y;
  const overCeiling = altY - FLIGHT_CEILING;
  const ceilFactor = overCeiling <= 0 ? 1 : clamp01(1 - overCeiling / CEILING_FADE_M);
  if (overCeiling > 0) {
    _imp.set(0, -Math.min(overCeiling, CEILING_FADE_M) * 0.6 * mass * dt, 0);
    chassis.applyImpulse(_imp, true);
  }

  // ── Primary thrust + lift ────────────────────────────────────────────────────────────────
  if (f.fixedWing) {
    // Plane: engine thrust along the nose.
    const throttle = clamp01(input.throttle ?? 0) * engineHealth * ceilFactor;
    if (throttle > 0) {
      _imp.copy(_fwd).multiplyScalar(throttle * f.maxThrust * dt);
      chassis.applyImpulse(_imp, true);
    }
    // Wing lift along body-up, ∝ forward airspeed² (clamped). Below takeoff speed it can't hold
    // the weight → the plane sinks (basic stall). Well above, it climbs eagerly.
    const va = Math.min(Math.max(fwdSpeed, 0), f.liftSpeedCap);
    const lift = f.liftCoeff * va * va;
    if (lift > 0) {
      _imp.copy(_up).multiplyScalar(lift * dt);
      chassis.applyImpulse(_imp, true);
    }
  } else {
    // Helicopter: collective thrust along body-up. At hoverCollective it cancels gravity when
    // level; tilt the body and that same thrust vector pushes you horizontally.
    const collective = clamp01(input.lift ?? 0) * engineHealth * ceilFactor;
    const thrust = collective * f.maxThrust;
    if (thrust > 0) {
      _imp.copy(_up).multiplyScalar(thrust * dt);
      chassis.applyImpulse(_imp, true);
    }
  }

  // ── Control torques (planes lose authority at low airspeed; helis keep full authority) ─────
  const auth = f.fixedWing ? clamp01(0.12 + speed / f.controlRefSpeed) : 1;
  _tq.set(0, 0, 0);
  _tq.addScaledVector(_right, -pitch * f.pitchTorque * auth); // +pitch = nose up
  _tq.addScaledVector(_fwd, -roll * f.rollTorque * auth); // +roll = bank right
  _tq.addScaledVector(_up, yaw * f.yawTorque * auth); // +yaw = nose right
  // Coordinated turn (fixed-wing): a bank auto-adds a little same-way yaw so it carves rather
  // than skidding. _right.y is negative when banked right → yaw right.
  if (f.fixedWing) _tq.addScaledVector(_up, -_right.y * f.yawTorque * 0.35 * auth);
  _tq.multiplyScalar(dt);
  chassis.applyTorqueImpulse(_tq, true);

  // ── Auto-level toward world-up (arcade forgiveness), faded out while actively maneuvering ──
  const activeCmd = Math.min(1, Math.abs(pitch) + Math.abs(roll));
  const levelGain = f.levelAssist * (1 - activeCmd);
  if (levelGain > 0) {
    const align = _up.dot(WORLD_UP);
    if (align < 0.999) {
      _cross.crossVectors(_up, WORLD_UP); // rotation axis that brings up → world-up
      _tq.copy(_cross).multiplyScalar(levelGain * mass * dt);
      chassis.applyTorqueImpulse(_tq, true);
    }
  }

  // ── Heading assist / weather-vane: cancel sideways velocity (wings + fuselage / heli drift) ─
  if (f.headingAssist > 0 && speed > 0.5) {
    const side = _v.dot(_right);
    if (Math.abs(side) > 1e-3) {
      _imp.copy(_right).multiplyScalar(-side * f.headingAssist * mass * dt);
      chassis.applyImpulse(_imp, true);
    }
  }

  // ── Optional extra rate-based linear drag (most craft rely on body linearDamping instead) ──
  if (f.linearDrag > 0 && speed > 0.01) {
    _imp.copy(_v).multiplyScalar(-f.linearDrag * mass * dt);
    chassis.applyImpulse(_imp, true);
  }
  if (f.angularDrag > 0) {
    const av = chassis.angvel();
    _tq.set(av.x, av.y, av.z).multiplyScalar(-f.angularDrag * mass * dt);
    chassis.applyTorqueImpulse(_tq, true);
  }
}
