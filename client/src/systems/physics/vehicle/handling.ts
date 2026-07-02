// The per-step "solver glue": read driver intent, drive the raw raycast controller (engine /
// brake / steering with a speed-sensitive lock), layer on an arcade feel (down-force, low-speed
// grip assist, upright/anti-roll assist, air control), advance the controller, then read wheel
// transforms + telemetry back out. Zero per-frame allocation — all scratch is module-level.
import * as THREE from "three";
import { PHYS_DT } from "@sunbreak/shared";
import { createInitialVehicleState, type DriverInput } from "./types";
import type { VehicleHandleImpl } from "./runtime";

const EMPTY_INPUT: DriverInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reverse: false,
};

// Upright assist only engages past this tilt (≈23°) so gentle slopes/corner lean are untouched.
const UPRIGHT_TILT_GATE = 0.08;

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _v = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _tq = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _qyaw = new THREE.Quaternion();
const _qspin = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampAxis = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Drive + advance one vehicle for a single fixed physics step. Call from
 * `useBeforePhysicsStep` so the resulting chassis velocity is integrated this step.
 */
export function applyDriverStep(
  handle: VehicleHandleImpl,
  dt: number,
  filterFlags: number,
  filterGroups: number,
): void {
  const ctrl = handle.controller;
  const chassis = handle.chassis;
  if (!ctrl || !chassis) return;
  const cfg = handle.config;
  const a = cfg.arcade;
  const input = handle.entity.veh_input ?? EMPTY_INPUT;
  const n = ctrl.numWheels();

  const fwdSpeed = ctrl.currentVehicleSpeed();
  const speed = Math.abs(fwdSpeed);
  const speedKmh = speed * 3.6;

  // Steering: speed-sensitive lock (less lock at speed) + exponential smoothing.
  const st = clamp01(speed / cfg.steerSpeedRef);
  const lock = cfg.maxSteer * lerp(1, cfg.steerAtMaxSpeed, st);
  const targetSteer = cfg.steerSign * clampAxis(input.steer) * lock;
  handle.steerAngle = THREE.MathUtils.damp(handle.steerAngle, targetSteer, cfg.steerDampRate, dt);

  // Engine force with a soft top-speed taper (forward only).
  const engineHealth = clamp01(handle.entity.veh_engineHealth ?? handle.engineHealth ?? 1);
  const throttle = clamp01(input.throttle);
  const taper = input.reverse ? 1 : Math.max(0, 1 - clamp01((speedKmh - cfg.topSpeedKmh) / 20));
  const drive =
    (input.reverse ? -throttle * cfg.reverseForce : throttle * cfg.engineForce) *
    engineHealth *
    taper;

  const brake = clamp01(input.brake) * cfg.brakeForce;
  const handbrakeForce = input.handbrake ? cfg.handbrakeForce : 0;

  for (let i = 0; i < n; i++) {
    const w = cfg.wheels[i];
    if (!w) continue;
    if (w.steered) ctrl.setWheelSteering(i, handle.steerAngle);
    ctrl.setWheelEngineForce(i, w.driven ? drive : 0);
    ctrl.setWheelBrake(i, brake + (w.handbrake ? handbrakeForce : 0));
    // Drift: drop grip on the handbraked (rear) wheels while the handbrake is held.
    const drifting = input.handbrake && w.handbrake;
    ctrl.setWheelFrictionSlip(i, handle.baseFrictionSlip[i]! * (drifting ? a.driftFrictionMul : 1));
    ctrl.setWheelSideFrictionStiffness(
      i,
      handle.baseSideFriction[i]! * (drifting ? a.driftSideMul : 1),
    );
  }

  applyArcadeForces(handle, input, dt);

  ctrl.updateVehicle(dt, filterFlags, filterGroups);
}

/** Down-force, low-speed grip assist, upright assist, and air control on the chassis. */
function applyArcadeForces(handle: VehicleHandleImpl, input: DriverInput, dt: number): void {
  const ctrl = handle.controller!;
  const chassis = handle.chassis!;
  const cfg = handle.config;
  const a = cfg.arcade;

  const r = chassis.rotation();
  _q.set(r.x, r.y, r.z, r.w);
  _up.set(0, 1, 0).applyQuaternion(_q);
  _fwd.set(0, 0, 1).applyQuaternion(_q);
  _right.set(1, 0, 0).applyQuaternion(_q);

  const lin = chassis.linvel();
  _v.set(lin.x, lin.y, lin.z);
  const fwdSpeed = _v.dot(_fwd);
  const speed = _v.length();
  const mass = chassis.mass() || cfg.mass;

  const n = ctrl.numWheels();
  let onGround = 0;
  for (let i = 0; i < n; i++) if (ctrl.wheelIsInContact(i)) onGround++;
  const grounded = onGround > 0;

  // Down-force ∝ forwardSpeed², pressed along the chassis' own down axis (planted in banking).
  if (grounded && speed > 1) {
    const f = a.downforce * fwdSpeed * fwdSpeed;
    _imp.copy(_up).multiplyScalar(-f * dt);
    chassis.applyImpulse(_imp, true);
  }

  // Grip assist: cancel a fraction of lateral velocity at low speed (fades out with speed, off
  // while drifting) so the car doesn't slither at parking speeds but can still slide fast.
  if (grounded && !handle.drifting) {
    const lat = _v.dot(_right);
    const fade = 1 - clamp01(speed / a.gripFadeSpeed);
    if (fade > 0 && Math.abs(lat) > 0.01) {
      _imp.copy(_right).multiplyScalar(-lat * a.gripAssist * fade * mass);
      chassis.applyImpulse(_imp, true);
    }
  }

  // Upright assist: torque that rotates the chassis' up toward world-up, scaled by tilt so it's
  // silent during normal driving and only fights genuine (near-)rollovers. Damps roll + pitch
  // rates but preserves yaw so cornering stays responsive.
  const align = _up.dot(WORLD_UP);
  const tilt = 1 - align;
  if (tilt > UPRIGHT_TILT_GATE) {
    _cross.crossVectors(_up, WORLD_UP);
    _tq.copy(_cross).multiplyScalar(a.antiRoll * tilt * mass);
    const av = chassis.angvel();
    const rollRate = av.x * _fwd.x + av.y * _fwd.y + av.z * _fwd.z;
    const pitchRate = av.x * _right.x + av.y * _right.y + av.z * _right.z;
    _tq.addScaledVector(_fwd, -rollRate * a.antiRollDamp * mass);
    _tq.addScaledVector(_right, -pitchRate * a.antiRollDamp * mass);
    _tq.multiplyScalar(dt);
    chassis.applyTorqueImpulse(_tq, true);
  }

  // Air control: let the player pitch/yaw the car while all wheels are off the ground.
  if (!grounded) {
    _tq.set(0, 0, 0);
    _tq.addScaledVector(_up, cfg.steerSign * clampAxis(input.steer) * a.airYaw * dt);
    _tq.addScaledVector(_right, (clamp01(input.throttle) - clamp01(input.brake)) * a.airPitch * dt);
    chassis.applyTorqueImpulse(_tq, true);
  }
}

/**
 * Read wheel transforms onto their visual groups and publish telemetry to `veh_state` +
 * mirror the chassis pose to `entity.transform`. Call from `useAfterPhysicsStep`.
 */
export function readVehicleState(handle: VehicleHandleImpl): void {
  const ctrl = handle.controller;
  const chassis = handle.chassis;
  if (!ctrl || !chassis) return;
  const cfg = handle.config;
  const entity = handle.entity;
  const n = ctrl.numWheels();

  // Sync wheel visuals: hang each wheel by its suspension length, then steer (yaw) + roll (spin).
  for (let i = 0; i < n; i++) {
    const g = handle.wheels[i];
    const w = cfg.wheels[i];
    if (!g || !w) continue;
    const susp = ctrl.wheelSuspensionLength(i);
    const len = susp == null ? w.suspensionRestLength : susp;
    g.position.set(w.position[0], w.position[1] - len, w.position[2]);
    const steering = ctrl.wheelSteering(i) ?? 0;
    const spin = ctrl.wheelRotation(i) ?? 0;
    _qyaw.setFromAxisAngle(UP_AXIS, steering);
    _qspin.setFromAxisAngle(X_AXIS, spin);
    g.quaternion.multiplyQuaternions(_qyaw, _qspin);
  }

  const fwdSpeed = ctrl.currentVehicleSpeed();
  const speed = Math.abs(fwdSpeed);
  const speedKmh = speed * 3.6;

  let onGround = 0;
  for (let i = 0; i < n; i++) if (ctrl.wheelIsInContact(i)) onGround++;

  // Slip angle (velocity vs heading, on the ground plane) → drift state machine with hysteresis.
  const handbrake = entity.veh_input?.handbrake ?? false;
  const r = chassis.rotation();
  const lin = chassis.linvel();
  _v.set(lin.x, 0, lin.z);
  const planar = _v.length();
  let slip = 0;
  if (planar > 0.5) {
    _q.set(r.x, r.y, r.z, r.w);
    _fwd.set(0, 0, 1).applyQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    const fl = Math.hypot(_fwd.x, _fwd.z) || 1;
    const rl = Math.hypot(_right.x, _right.z) || 1;
    const fdot = (_v.x * _fwd.x + _v.z * _fwd.z) / (planar * fl);
    const sdot = (_v.x * _right.x + _v.z * _right.z) / (planar * rl);
    slip = Math.atan2(sdot, fdot);
  }
  const absSlip = Math.abs(slip);
  const a = cfg.arcade;
  const enter = handbrake || absSlip > a.driftEnterAngle;
  const stay = handbrake || absSlip > a.driftExitAngle;
  handle.drifting = planar > a.driftMinSpeed && (handle.drifting ? stay : enter);
  if (handle.drifting) handle.driftScore += speedKmh * absSlip * PHYS_DT * 0.5;

  // Pseudo gear / RPM for HUD + engine audio.
  const reverse = fwdSpeed < -0.3;
  const ratio = clamp01(speedKmh / cfg.topSpeedKmh);
  const gear = reverse ? 0 : Math.min(cfg.gears, 1 + Math.floor(ratio * cfg.gears));
  const perGear = 1 / cfg.gears;
  const within = clamp01((ratio - (Math.max(1, gear) - 1) * perGear) / perGear);
  const rpm01 = clamp01(0.15 + within * 0.85);

  const state = (entity.veh_state ??= createInitialVehicleState());
  state.speedKmh = speedKmh;
  state.forwardSpeed = fwdSpeed;
  state.rpm01 = rpm01;
  state.gear = gear;
  state.engineHealth = clamp01(entity.veh_engineHealth ?? 1);
  state.grounded = onGround > 0;
  state.wheelsOnGround = onGround;
  state.isDrifting = handle.drifting;
  state.driftScore = handle.driftScore;

  // Mirror the chassis pose into the ECS transform so camera / AI / minimap can read it.
  const p = chassis.translation();
  const tf = entity.transform;
  if (tf) {
    tf.position.x = p.x;
    tf.position.y = p.y;
    tf.position.z = p.z;
    tf.rotation.x = r.x;
    tf.rotation.y = r.y;
    tf.rotation.z = r.z;
    tf.rotation.w = r.w;
  }
}
