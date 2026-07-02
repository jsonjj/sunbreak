// Procedural, in-place locomotion clips authored on the (sanitized) Mixamo skeleton (`mixamorig*`).
//
// WHY: the real Mixamo clip packs are binary .glb assets fetched offline via an Adobe account
// (royalty-free, not CC0) and are not committed to the repo. Until those are registered via
// `registerLocomotionClips`, these synthesized clips give the driver a real, testable end-to-end
// path (idle/walk/run/sprint) that binds to the shared rig by bone name — completely free and
// with zero binary assets. Real clips supersede them at load.
//
// MOTION: contralateral limb swing sampled from smooth sinusoidal drivers (not linear "robot"
// keys), a heel-strike→toe-off ankle roll, knee flex biased into the swing phase, and spine
// counter-rotation. Rotation-only (no Hips translation) so the clips are inherently in-place and
// rig-agnostic — the Rapier capsule owns world position, and the driver's timeScale sync matches
// cadence to ground speed. Each gait's duration is solved (forward-kinematics on the shared rig's
// standard segment lengths) so its baked stride ≈ the gait's nominal ground speed → no foot slide.

import { AnimationClip, Euler, Matrix4, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
import { RUN_SPEED, SPRINT_SPEED, WALK_SPEED } from "@sunbreak/shared";
import { CLIP, MIXAMO_PREFIX } from "./constants";

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const SAMPLES = 24; // per cycle; +1 closing keyframe makes the loop seamless

const _euler = new Euler();
const _quat = new Quaternion();

type DegFn = (phase: number) => readonly [number, number, number];
type NumFn = (phase: number) => number;

/** Seamless-looping quaternion track from a per-phase Euler (degrees) driver, on a sanitized bone. */
function track(bone: string, dur: number, fn: DegFn): QuaternionKeyframeTrack {
  const times = new Float32Array(SAMPLES + 1);
  const values = new Float32Array((SAMPLES + 1) * 4);
  for (let i = 0; i <= SAMPLES; i++) {
    const p = i / SAMPLES;
    times[i] = p * dur;
    const [x, y, z] = fn(p);
    _euler.set(x * D2R, y * D2R, z * D2R, "XYZ");
    _quat.setFromEuler(_euler);
    const o = i * 4;
    values[o] = _quat.x;
    values[o + 1] = _quat.y;
    values[o + 2] = _quat.z;
    values[o + 3] = _quat.w;
  }
  return new QuaternionKeyframeTrack(`${MIXAMO_PREFIX}${bone}.quaternion`, Array.from(times), values);
}

// Phase convention matches the character-content library: LEFT leg drives phase p (heel-strike at
// p=0), a down-hanging limb rotated by +X pitches toward −Z (forward), so +thigh swings forward.
const legThigh = (A: number): NumFn => (p) => A * Math.cos(TAU * p);
const legKnee = (base: number, swing: number): NumFn => (p) =>
  base + swing * Math.max(0, Math.sin(TAU * (p - 0.5))) ** 1.3;
const ankle = (A: number): NumFn => (p) => A * Math.sin(TAU * (p + 0.25));
const shoulder = (A: number): NumFn => (p) => -A * Math.cos(TAU * p);
const elbow = (base: number, swing: number): NumFn => (p) =>
  -(base + swing * Math.max(0, Math.sin(TAU * p)));

interface GaitShape {
  targetSpeed: number;
  thigh: number;
  kneeBase: number;
  kneeSwing: number;
  foot: number;
  arm: number;
  foreArmBase: number;
  foreArmSwing: number;
  lean: number;
  pelvisYaw: number;
}

// ── Stride measurement (forward kinematics on the shared rig's standard segment lengths) ───────────
// Matches character-content/rig/skeleton.ts so procedural clips and that rig agree on cadence.
const HIP = new Vector3(0, 0.98, 0);
const OFF_UPLEG = new Vector3(0.1, -0.07, 0);
const OFF_LEG = new Vector3(0, -0.42, 0);
const OFF_FOOT = new Vector3(0, -0.41, 0);
const OFF_TOE = new Vector3(0, -0.06, -0.12);

function rotX(deg: number): Matrix4 {
  _euler.set(deg * D2R, 0, 0, "XYZ");
  _quat.setFromEuler(_euler);
  return new Matrix4().makeRotationFromQuaternion(_quat);
}
function toeZ(p: number, thigh: NumFn, knee: NumFn, foot: NumFn): number {
  const m = new Matrix4()
    .setPosition(HIP)
    .multiply(new Matrix4().setPosition(OFF_UPLEG)).multiply(rotX(thigh(p)))
    .multiply(new Matrix4().setPosition(OFF_LEG)).multiply(rotX(knee(p)))
    .multiply(new Matrix4().setPosition(OFF_FOOT)).multiply(rotX(foot(p)))
    .multiply(new Matrix4().setPosition(OFF_TOE));
  return new Vector3().setFromMatrixPosition(m).z;
}

/** Cycle duration (s) so the baked stride advances the body at `targetSpeed` with planted feet. */
function strideDuration(s: GaitShape): number {
  const thigh = legThigh(s.thigh);
  const knee = legKnee(s.kneeBase, s.kneeSwing);
  const foot = ankle(s.foot);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 64; i++) {
    const z = toeZ(i / 64, thigh, knee, foot);
    if (z < min) min = z;
    if (z > max) max = z;
  }
  const peakToPeak = max - min; // one foot's fore/aft excursion; body advances ≈ 2×pp per cycle
  return (2 * peakToPeak) / s.targetSpeed;
}

function gaitClip(name: string, s: GaitShape): AnimationClip {
  const dur = strideDuration(s);
  const R = 0.5;
  const lThigh = legThigh(s.thigh);
  const lKnee = legKnee(s.kneeBase, s.kneeSwing);
  const lFoot = ankle(s.foot);
  const lArm = shoulder(s.arm);
  const lElbow = elbow(s.foreArmBase, s.foreArmSwing);
  const off = (f: NumFn): NumFn => (p) => f(p + R);

  const tracks = [
    track("LeftUpLeg", dur, (p) => [lThigh(p), 0, 0]),
    track("RightUpLeg", dur, (p) => [off(lThigh)(p), 0, 0]),
    track("LeftLeg", dur, (p) => [lKnee(p), 0, 0]),
    track("RightLeg", dur, (p) => [off(lKnee)(p), 0, 0]),
    track("LeftFoot", dur, (p) => [lFoot(p), 0, 0]),
    track("RightFoot", dur, (p) => [off(lFoot)(p), 0, 0]),
    track("LeftArm", dur, (p) => [lArm(p), 0, 4]),
    track("RightArm", dur, (p) => [off(lArm)(p), 0, -4]),
    track("LeftForeArm", dur, (p) => [lElbow(p), 0, 0]),
    track("RightForeArm", dur, (p) => [off(lElbow)(p), 0, 0]),
    track("Spine", dur, (p) => [s.lean * 0.55, -s.pelvisYaw * 0.7 * Math.sin(TAU * p), 0]),
    track("Spine1", dur, (p) => [s.lean * 0.3, -s.pelvisYaw * 0.4 * Math.sin(TAU * p), 0]),
    track("Head", dur, (p) => [-s.lean * 0.25, -s.pelvisYaw * 0.15 * Math.sin(TAU * p), 0]),
    // Pelvis rotation only (no translation → inherently in-place / rig-agnostic).
    track("Hips", dur, (p) => [-s.lean * 0.15, s.pelvisYaw * Math.sin(TAU * p), -2 * Math.sin(TAU * p)]),
  ];
  return new AnimationClip(name, dur, tracks);
}

function idleClip(): AnimationClip {
  const dur = 4;
  return new AnimationClip(CLIP.idle, dur, [
    track("Spine", dur, (p) => [1.5 + 0.5 * Math.sin(TAU * p), 0, 0]),
    track("Spine1", dur, (p) => [0.8 * Math.sin(TAU * p), 0, 0.5 * Math.sin(TAU * p)]),
    track("Head", dur, (p) => [-1, 3 * Math.sin(TAU * 0.5 * p), 0]),
    track("LeftArm", dur, () => [4, 0, 7]),
    track("RightArm", dur, () => [4, 0, -7]),
    track("LeftForeArm", dur, () => [-11, 0, 0]),
    track("RightForeArm", dur, () => [-11, 0, 0]),
  ]);
}

/**
 * Build the full procedural locomotion set (idle/walk/run/sprint). Stride and cadence scale per
 * gait; the driver's timeScale sync then matches cadence to actual ground speed.
 */
export function buildProceduralLocomotionClips(): AnimationClip[] {
  return [
    idleClip(),
    gaitClip(CLIP.walk, {
      targetSpeed: WALK_SPEED, thigh: 25, kneeBase: 6, kneeSwing: 52, foot: 16,
      arm: 22, foreArmBase: 12, foreArmSwing: 8, lean: 4, pelvisYaw: 6,
    }),
    gaitClip(CLIP.run, {
      targetSpeed: RUN_SPEED, thigh: 42, kneeBase: 12, kneeSwing: 88, foot: 26,
      arm: 48, foreArmBase: 58, foreArmSwing: 20, lean: 13, pelvisYaw: 8,
    }),
    gaitClip(CLIP.sprint, {
      targetSpeed: SPRINT_SPEED, thigh: 55, kneeBase: 16, kneeSwing: 104, foot: 30,
      arm: 62, foreArmBase: 74, foreArmSwing: 22, lean: 21, pelvisYaw: 9,
    }),
  ];
}
