// Arcade watercraft model. Runs inside the fixed physics step (before the solver, from
// useDynamicVehicleController). Floats the hull on a flat water plane (WATER_LEVEL) with a
// spring-damper buoyancy, drives it with a nose-aligned propeller, and steers with a
// speed-scaled rudder + a keel that kills sideways slip. Zero per-frame allocation.
//
// There is no water COLLIDER in the world (water is a render-only plane), so buoyancy here is
// purely force-based: it engages whenever the hull's centre dips below the water surface. Since
// the only terrain below y=0 is seabed/bay/glades, this naturally restricts floating to water.
import * as THREE from "three";
import { GRAVITY } from "@sunbreak/shared";
import type { DriverInput } from "./types";
import type { VehicleHandleImpl } from "./runtime";

const G = Math.abs(GRAVITY[1]);

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
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Apply one step of arcade boat forces. Call from `useBeforePhysicsStep`. */
export function applyBoatStep(handle: VehicleHandleImpl, dt: number): void {
  const chassis = handle.chassis;
  const cfg = handle.config;
  const b = cfg.boat;
  if (!chassis || !b) return;

  const input = handle.entity.veh_input ?? EMPTY;
  const engineHealth = clamp01(handle.entity.veh_engineHealth ?? 1);

  const r = chassis.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  _up.set(0, 1, 0).applyQuaternion(_q);
  _fwd.set(0, 0, 1).applyQuaternion(_q);
  _right.set(1, 0, 0).applyQuaternion(_q);

  const lin = chassis.linvel();
  _v.set(lin.x, lin.y, lin.z);
  const mass = chassis.mass() || cfg.mass;
  const pos = chassis.translation();

  // Submersion of the hull centre below the water plane (>0 means underwater).
  const submersion = b.waterLevel - pos.y;
  const inWater = submersion > -b.draft * 0.5;

  // ── Buoyancy (spring toward the surface) + heave damping ──────────────────────────────────
  if (submersion > 0) {
    const upMul = clamp(submersion / b.draft, 0, b.buoyancy); // multiples of weight
    let fUp = upMul * mass * G;
    fUp -= b.heaveDamp * mass * _v.y; // damp vertical bobbing
    _imp.set(0, fUp * dt, 0);
    chassis.applyImpulse(_imp, true);
  }

  const fwdSpeed = _v.dot(_fwd);
  const sideSpeed = _v.dot(_right);

  if (inWater) {
    // ── Propeller thrust (throttle forward, brake = reverse) ─────────────────────────────────
    const throttle = clamp01(input.throttle ?? 0) * engineHealth;
    const brake = clamp01(input.brake ?? 0) * engineHealth;
    const drive = throttle * b.thrust - brake * b.reverseThrust;
    if (drive !== 0) {
      _imp.copy(_fwd).multiplyScalar(drive * dt);
      _imp.y = 0; // keep thrust planar so the nose pitch doesn't dig/lift the hull
      chassis.applyImpulse(_imp, true);
    }

    // ── Rudder (yaw scales with speed; inverts in reverse) + bank into the turn ──────────────
    const steer = clampAxis(input.steer ?? 0);
    if (steer !== 0) {
      const bite = clamp(Math.abs(fwdSpeed) / 6, 0, 1);
      const dir = fwdSpeed >= 0 ? 1 : -1;
      _tq.set(0, 0, 0);
      _tq.addScaledVector(_up, steer * b.steerTorque * bite * dir);
      _tq.addScaledVector(_fwd, -steer * b.turnBank * Math.abs(fwdSpeed) * mass);
      _tq.multiplyScalar(dt);
      chassis.applyTorqueImpulse(_tq, true);
    }

    // ── Hydrodynamic drag: gentle along the hull, strong across it (the keel) ────────────────
    _imp.copy(_fwd).multiplyScalar(-fwdSpeed * b.forwardDrag * mass * dt);
    chassis.applyImpulse(_imp, true);
    _imp.copy(_right).multiplyScalar(-sideSpeed * b.lateralDrag * mass * dt);
    chassis.applyImpulse(_imp, true);
  }

  // ── Self-right toward upright (so wakes/impacts can't capsize it) ─────────────────────────
  const align = _up.dot(WORLD_UP);
  if (align < 0.999) {
    _cross.crossVectors(_up, WORLD_UP);
    _tq.copy(_cross).multiplyScalar(b.levelAssist * mass * dt);
    chassis.applyTorqueImpulse(_tq, true);
  }
  if (b.angularDrag > 0) {
    const av = chassis.angvel();
    _tq.set(av.x, av.y, av.z).multiplyScalar(-b.angularDrag * mass * dt);
    chassis.applyTorqueImpulse(_tq, true);
  }
}
