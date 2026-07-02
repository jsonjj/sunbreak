// The shared clip library, authored in code against the canonical bone names. Because every biped
// (procedural or imported CC0 GLB) uses those exact names, ONE set of clips plays on all of them
// with zero retargeting. Motion applies real animation principles: contralateral arm/leg swing,
// smoothly-sampled sinusoidal drivers (no linear "robot" interpolation), a heel-strike→toe-off
// ankle roll, a knee that folds BACK through swing, pelvic rotation + weight-shift sway + a gentle
// two-per-stride bounce, a spine that counter-rotates the thorax against the pelvis, and shoulders
// that roll with the arm swing.
//
// FORWARD GAITS: rotating a down-hanging limb by +X pitches it toward -Z (the model's forward), so
// +thigh swings the leg forward and the knee folds back (negative X). Do NOT flip these signs — a
// hyperextending (positive) knee reads as a reversed, moonwalking gait.
//
// FOOT-SLIDE: each gait clip is measured (forward-kinematics on the shared skeleton) to find the
// ground speed at which its baked stride reads as planted — its `nominalSpeed`. The animator plays
// the clip at `timeScale = actualSpeed / nominalSpeed`, so the feet track the ground at any pace
// (GAIT_NOMINAL_SPEED, consumed by animator.ts).

import * as THREE from "three";
import type { AnimState } from "../types";
import { BONE, BONE_DEFS, restWorld, type BoneName } from "./skeleton";

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
/** Samples per gait cycle. High enough that the sinusoidal drivers read as smooth curves. */
const GAIT_SAMPLES = 28;

/** Quaternion track from per-key XYZ Euler angles in DEGREES. */
function qTrack(bone: BoneName, times: number[], degKeys: ReadonlyArray<readonly [number, number, number]>): THREE.QuaternionKeyframeTrack {
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const k of degKeys) {
    e.set(k[0] * D2R, k[1] * D2R, k[2] * D2R, "XYZ");
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

/** Constant single-key rotation (holds a bone at one pose). */
function qHold(bone: BoneName, deg: readonly [number, number, number]): THREE.QuaternionKeyframeTrack {
  return qTrack(bone, [0], [deg]);
}

/** Hips vertical bob (absolute local position; base is the rest local offset). */
function hipsBob(times: number[], bob: number[]): THREE.VectorKeyframeTrack {
  const base = restWorld(BONE.Hips); // Hips is the root bone: world === local rest
  const values: number[] = [];
  for (const dy of bob) values.push(base.x, base.y + dy, base.z);
  return new THREE.VectorKeyframeTrack(`${BONE.Hips}.position`, times, values);
}

// ── Smoothly-sampled gait drivers ────────────────────────────────────────────────────────────────
type DegFn = (phase: number) => readonly [number, number, number];
type NumFn = (phase: number) => number;

/** Sample a per-phase Euler (degrees) driver into a seamless-looping quaternion track. */
function sampledQuat(bone: BoneName, dur: number, fn: DegFn): THREE.QuaternionKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i <= GAIT_SAMPLES; i++) {
    const p = i / GAIT_SAMPLES;
    times.push(p * dur);
    const [x, y, z] = fn(p);
    e.set(x * D2R, y * D2R, z * D2R, "XYZ");
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

/** Sample a per-phase vertical bob (meters) into a position track on the Hips. */
function sampledBob(dur: number, fn: NumFn): THREE.VectorKeyframeTrack {
  const base = restWorld(BONE.Hips);
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i <= GAIT_SAMPLES; i++) {
    const p = i / GAIT_SAMPLES;
    times.push(p * dur);
    values.push(base.x, base.y + fn(p), base.z);
  }
  return new THREE.VectorKeyframeTrack(`${BONE.Hips}.position`, times, values);
}

interface GaitParams {
  dur: number;
  /** Thigh fore/aft swing amplitude (deg). */
  thigh: number;
  /** Knee flex during swing (deg) + a small always-on flex. */
  kneeSwing: number;
  kneeBase: number;
  /** Ankle heel→toe roll amplitude (deg). */
  foot: number;
  /** Shoulder swing amplitude (deg, counter to same-side leg). */
  arm: number;
  /** Elbow flex: constant + a little extra on the back-swing (deg). */
  foreArmBase: number;
  foreArmSwing: number;
  /** Forward torso lean (deg). */
  lean: number;
  /** Pelvic yaw amplitude (deg); the thorax counter-rotates a fraction of this. */
  pelvisYaw: number;
  /** Pelvic lateral drop toward the swing side (Trendelenburg, deg). */
  hipDrop: number;
  /** Two-per-stride vertical bounce (m), peaking at each mid-stance. */
  bob: number;
}

// Phase convention: the LEFT leg drives global phase p (heel-strike at p=0). Rotating a down-hanging
// limb by +X pitches it toward -Z (the model's forward), so +thigh = swing forward.
function legThigh(A: number): NumFn {
  return (p) => A * Math.cos(TAU * p); // +A forward at heel-strike, -A at toe-off
}
function legKnee(base: number, swing: number): NumFn {
  // Knee stays near-straight through stance, folds BACK through swing (peak ≈ p 0.75). A NEGATIVE X
  // angle folds the shin toward the buttock (heel up-and-back). A positive angle would hyperextend
  // the knee forward, reading as a reversed, moonwalking gait — do not flip.
  return (p) => -(base + swing * Math.max(0, Math.sin(TAU * (p - 0.5))) ** 1.3);
}
function ankle(A: number): NumFn {
  // Toe-up at heel-strike (p≈0), plantarflex push at toe-off (p≈0.5), neutral through swing.
  return (p) => A * Math.sin(TAU * (p + 0.25));
}
function shoulder(A: number): NumFn {
  return (p) => -A * Math.cos(TAU * p); // opposite the same-side leg
}
function elbow(base: number, swing: number): NumFn {
  return (p) => -(base + swing * Math.max(0, Math.sin(TAU * p)));
}

function buildGait(name: string, s: GaitParams): THREE.AnimationClip {
  const dur = s.dur;
  const R = 0.5; // right-leg phase offset (contralateral)

  const lThigh = legThigh(s.thigh);
  const lKnee = legKnee(s.kneeBase, s.kneeSwing);
  const lFoot = ankle(s.foot);
  const lArm = shoulder(s.arm);
  const lElbow = elbow(s.foreArmBase, s.foreArmSwing);
  const off = (f: NumFn): NumFn => (p) => f(p + R);

  const rThigh = off(lThigh);
  const rKnee = off(lKnee);
  const rFoot = off(lFoot);
  const rArm = off(lArm);
  const rElbow = off(lElbow);

  // Two bounces per stride, lowest at each double-support (p 0, 0.5), highest at mid-stance.
  const bob: NumFn = (p) => s.bob * (0.5 - 0.5 * Math.cos(2 * TAU * p));

  const tracks: THREE.KeyframeTrack[] = [
    // Legs — contralateral. Arm is counter to its OWN-side leg (so arm ↔ opposite leg swing).
    sampledQuat(BONE.LUpLeg, dur, (p) => [lThigh(p), 0, 3]),
    sampledQuat(BONE.RUpLeg, dur, (p) => [rThigh(p), 0, -3]),
    sampledQuat(BONE.LLeg, dur, (p) => [lKnee(p), 0, 0]),
    sampledQuat(BONE.RLeg, dur, (p) => [rKnee(p), 0, 0]),
    sampledQuat(BONE.LFoot, dur, (p) => [lFoot(p), 0, 0]),
    sampledQuat(BONE.RFoot, dur, (p) => [rFoot(p), 0, 0]),
    // Shoulders roll subtly with the arm swing (adds follow-through in the upper body).
    sampledQuat(BONE.LShoulder, dur, (p) => [0, 0, 3 + 0.14 * lArm(p)]),
    sampledQuat(BONE.RShoulder, dur, (p) => [0, 0, -3 - 0.14 * rArm(p)]),
    // Arms.
    sampledQuat(BONE.LArm, dur, (p) => [lArm(p), 0, 5]),
    sampledQuat(BONE.RArm, dur, (p) => [rArm(p), 0, -5]),
    sampledQuat(BONE.LForeArm, dur, (p) => [lElbow(p), 0, 0]),
    sampledQuat(BONE.RForeArm, dur, (p) => [rElbow(p), 0, 0]),
    // Spine: forward lean + thorax counter-rotation (against the pelvis) + a small lateral sway.
    sampledQuat(BONE.Spine, dur, (p) => [
      s.lean * 0.55,
      -s.pelvisYaw * 0.7 * Math.sin(TAU * p),
      0.4 * s.hipDrop * Math.sin(TAU * p),
    ]),
    sampledQuat(BONE.Spine1, dur, (p) => [s.lean * 0.3, -s.pelvisYaw * 0.4 * Math.sin(TAU * p), 0]),
    sampledQuat(BONE.Spine2, dur, (p) => [s.lean * 0.15, -s.pelvisYaw * 0.15 * Math.sin(TAU * p), 0]),
    // Head stays roughly level: counter the lean + a little of the hip yaw/roll so the gaze holds.
    sampledQuat(BONE.Head, dur, (p) => [
      -s.lean * 0.3,
      -s.pelvisYaw * 0.12 * Math.sin(TAU * p),
      -0.3 * s.hipDrop * Math.sin(TAU * p),
    ]),
    // Pelvis: yaw leads with the swing leg, drops toward the swing side, and rolls with the sway.
    sampledQuat(BONE.Hips, dur, (p) => [
      -s.lean * 0.15,
      s.pelvisYaw * Math.sin(TAU * p),
      -(2 + s.hipDrop) * Math.sin(TAU * p),
    ]),
    // Gentle vertical bounce (kept small so the non-IK stance foot barely lifts).
    sampledBob(dur, bob),
  ];
  return new THREE.AnimationClip(name, dur, tracks);
}

// ── Forward-kinematics stride measurement → nominal ground speed (kills foot slide) ────────────────
const OFFSET = new Map<BoneName, THREE.Vector3>(
  BONE_DEFS.map((b) => [b.name, new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2])] as const),
);

/** World-space fore/aft (Z) position of the left toe at phase p, given the gait's leg drivers. */
function toeZ(p: number, thigh: NumFn, knee: NumFn, foot: NumFn): number {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const rx = (deg: number): THREE.Matrix4 => {
    e.set(deg * D2R, 0, 0, "XYZ");
    q.setFromEuler(e);
    return new THREE.Matrix4().makeRotationFromQuaternion(q);
  };
  const T = (b: BoneName): THREE.Matrix4 => new THREE.Matrix4().setPosition(OFFSET.get(b)!);
  // Hips(rest, no yaw) · UpLeg(off·Rx) · Leg(off·Rx) · Foot(off·Rx) · Toe(off)
  m.copy(T(BONE.Hips))
    .multiply(T(BONE.LUpLeg)).multiply(rx(thigh(p)))
    .multiply(T(BONE.LLeg)).multiply(rx(knee(p)))
    .multiply(T(BONE.LFoot)).multiply(rx(foot(p)))
    .multiply(T(BONE.LToe));
  return new THREE.Vector3().setFromMatrixPosition(m).z;
}

/** Ground speed (m/s) at which this gait's baked stride reads as planted. */
function measureNominalSpeed(s: GaitParams): number {
  const thigh = legThigh(s.thigh);
  const knee = legKnee(s.kneeBase, s.kneeSwing);
  const foot = ankle(s.foot);
  let min = Infinity;
  let max = -Infinity;
  const STEPS = 64;
  for (let i = 0; i < STEPS; i++) {
    const z = toeZ(i / STEPS, thigh, knee, foot);
    if (z < min) min = z;
    if (z > max) max = z;
  }
  const peakToPeak = max - min; // fore/aft excursion of one foot per cycle
  // Body advances ≈ one excursion per half-cycle (each foot's stance), i.e. 2×pp per full cycle.
  return (2 * peakToPeak) / s.dur;
}

const GAIT_PARAMS: Readonly<Record<"Walk" | "Run" | "Sprint", GaitParams>> = {
  Walk: {
    dur: 1.0, thigh: 26, kneeSwing: 54, kneeBase: 5, foot: 17,
    arm: 24, foreArmBase: 12, foreArmSwing: 9, lean: 4, pelvisYaw: 7, hipDrop: 4, bob: 0.012,
  },
  Run: {
    // Believable run: a single smooth knee flex through swing (peak ≈ −82°, no over-fold, never
    // hyperextends), calmer arm carriage (elbows ~62° bent, moderate shoulder swing), forward lean +
    // gentle float. Signs unchanged (knee folds BACK) so the no-moonwalk fix holds; nominalSpeed is
    // auto-measured from these drivers so the feet stay planted (no slide) at the run speed.
    dur: 0.62, thigh: 48, kneeSwing: 66, kneeBase: 16, foot: 28,
    arm: 46, foreArmBase: 62, foreArmSwing: 20, lean: 16, pelvisYaw: 8, hipDrop: 3, bob: 0.028,
  },
  Sprint: {
    dur: 0.52, thigh: 58, kneeSwing: 108, kneeBase: 16, foot: 32,
    arm: 66, foreArmBase: 80, foreArmSwing: 24, lean: 22, pelvisYaw: 9, hipDrop: 2, bob: 0.03,
  },
};

/** Gait clip name → authored ground speed (m/s). The animator syncs timeScale to actual speed. */
export const GAIT_NOMINAL_SPEED: Readonly<Record<string, number>> = {
  Walk: measureNominalSpeed(GAIT_PARAMS.Walk),
  Run: measureNominalSpeed(GAIT_PARAMS.Run),
  Sprint: measureNominalSpeed(GAIT_PARAMS.Sprint),
};

function buildIdle(): THREE.AnimationClip {
  // Relaxed stance over a slow 6s cycle: breathing rise/fall, a gentle weight-shift from side to
  // side, an idle head glance, and arms that hang with a natural inward drape + micro-sway.
  const T = [0, 1.5, 3, 4.5, 6];
  const tracks: THREE.KeyframeTrack[] = [
    // breathing: chest rises, shoulders lift a touch
    qTrack(BONE.Spine, T, [[1.5, 0, 0], [2.4, 0, 0], [1.5, 0, 0], [2.2, 0, 0], [1.5, 0, 0]]),
    qTrack(BONE.Spine1, T, [[0, 0, 0], [1.0, 0, 1.0], [0, 0, 0], [-0.8, 0, -1.0], [0, 0, 0]]),
    qTrack(BONE.Spine2, T, [[0, 0, 0], [0.6, 1.5, 0], [0, 0, 0], [0.6, -1.5, 0], [0, 0, 0]]),
    // weight shift: pelvis rolls/settles onto one hip then the other
    qTrack(BONE.Hips, T, [[0, 0, 0], [0, 1.5, 1.4], [0, 0, 0], [0, -1.5, -1.4], [0, 0, 0]]),
    // idle head glances, out of phase with the sway
    qTrack(BONE.Head, T, [[0, 0, 0], [-1.5, 6, 1], [1, -3, 0], [-1, -6, -1], [0, 0, 0]]),
    qTrack(BONE.Neck, T, [[0, 0, 0], [0, 3, 0], [0, -1, 0], [0, -3, 0], [0, 0, 0]]),
    // Arms hang with a natural inward drape (slight abduction + constant elbow bend) + micro-sway.
    qTrack(BONE.LArm, T, [[3, 0, 7], [4, 0, 8], [3, 0, 7], [2, 0, 6], [3, 0, 7]]),
    qTrack(BONE.RArm, T, [[3, 0, -7], [2, 0, -6], [3, 0, -7], [4, 0, -8], [3, 0, -7]]),
    qHold(BONE.LForeArm, [-12, 2, 0]),
    qHold(BONE.RForeArm, [-12, -2, 0]),
    // subtle knees-soft stance
    qHold(BONE.LUpLeg, [1, 0, 2]),
    qHold(BONE.RUpLeg, [1, 0, -2]),
    qHold(BONE.LLeg, [-3, 0, 0]),
    qHold(BONE.RLeg, [-3, 0, 0]),
    hipsBob(T, [0, 0.01, 0, 0.008, 0]),
  ];
  return new THREE.AnimationClip("Idle", 6, tracks);
}

// ── Crouch poses ───────────────────────────────────────────────────────────────────────────────
// A settled squat: the pelvis drops ~0.18m and the knees flex deeply, but the leg angles are chosen
// (forward-kinematics on the shared skeleton) so both ANKLES land back at their rest, grounded
// position — the feet stay planted while everything above the knee lowers. Torso pitches forward and
// the arms draw in low. The controller separately shrinks the capsule + lowers the camera; together
// they read unmistakably as a crouch. CROUCH_* below are the shared stance the two clips build on.
const CROUCH_THIGH = 38; // hip flex (deg): thighs swing forward
const CROUCH_KNEE = -76; // knee flex (deg): shins fold back under the body
const CROUCH_FOOT = 38; // ankle (deg): re-levels the sole flat on the ground
const CROUCH_HIPS_DY = -0.18; // pelvis drop (m) from rest

function buildCrouchIdle(): THREE.AnimationClip {
  const T = [0, 1.6, 3.2];
  const tracks: THREE.KeyframeTrack[] = [
    // Legs — deep squat that keeps the ankles at their rest (grounded) position.
    qHold(BONE.LUpLeg, [CROUCH_THIGH, 0, 4]),
    qHold(BONE.RUpLeg, [CROUCH_THIGH, 0, -4]),
    qHold(BONE.LLeg, [CROUCH_KNEE, 0, 0]),
    qHold(BONE.RLeg, [CROUCH_KNEE, 0, 0]),
    qHold(BONE.LFoot, [CROUCH_FOOT, 0, 0]),
    qHold(BONE.RFoot, [CROUCH_FOOT, 0, 0]),
    // Torso pitched forward; head lifts to level the gaze, with a faint idle drift.
    qTrack(BONE.Spine, T, [[12, 0, 0], [13, 0, 0], [12, 0, 0]]),
    qHold(BONE.Spine1, [8, 0, 0]),
    qHold(BONE.Spine2, [4, 0, 0]),
    qTrack(BONE.Head, T, [[-12, 2, 0], [-12, -2, 0], [-12, 2, 0]]),
    // Arms drawn in and low (elbows bent, hands toward the knees).
    qHold(BONE.LArm, [24, 0, 8]),
    qHold(BONE.RArm, [24, 0, -8]),
    qHold(BONE.LForeArm, [-46, 6, 0]),
    qHold(BONE.RForeArm, [-46, -6, 0]),
    // Pelvis lowered, with a faint breathing rise.
    hipsBob(T, [CROUCH_HIPS_DY, CROUCH_HIPS_DY + 0.008, CROUCH_HIPS_DY]),
  ];
  return new THREE.AnimationClip("CrouchIdle", 3.2, tracks);
}

function buildCrouchWalk(): THREE.AnimationClip {
  // The crouch stance with a small, slow alternating cadence. Amplitudes are deliberately gentle so
  // the planted-feet squat still reads believably at this crawl pace.
  const dur = 0.85;
  const R = 0.5; // contralateral right-leg phase offset
  const lThigh = (p: number): number => CROUCH_THIGH + 11 * Math.cos(TAU * p);
  const rThigh = (p: number): number => CROUCH_THIGH + 11 * Math.cos(TAU * (p + R));
  const kneeFlex = (p: number): number => CROUCH_KNEE - 16 * Math.max(0, Math.sin(TAU * (p - 0.5))) ** 1.3;
  const lArm = (p: number): number => 24 - 12 * Math.cos(TAU * p); // counter to its own-side leg
  const rArm = (p: number): number => 24 - 12 * Math.cos(TAU * (p + R));
  const tracks: THREE.KeyframeTrack[] = [
    sampledQuat(BONE.LUpLeg, dur, (p) => [lThigh(p), 0, 4]),
    sampledQuat(BONE.RUpLeg, dur, (p) => [rThigh(p), 0, -4]),
    sampledQuat(BONE.LLeg, dur, (p) => [kneeFlex(p), 0, 0]),
    sampledQuat(BONE.RLeg, dur, (p) => [kneeFlex(p + R), 0, 0]),
    qHold(BONE.LFoot, [CROUCH_FOOT, 0, 0]),
    qHold(BONE.RFoot, [CROUCH_FOOT, 0, 0]),
    sampledQuat(BONE.LArm, dur, (p) => [lArm(p), 0, 8]),
    sampledQuat(BONE.RArm, dur, (p) => [rArm(p), 0, -8]),
    qHold(BONE.LForeArm, [-44, 6, 0]),
    qHold(BONE.RForeArm, [-44, -6, 0]),
    qHold(BONE.Spine, [13, 0, 0]),
    qHold(BONE.Spine1, [8, 0, 0]),
    qHold(BONE.Spine2, [4, 0, 0]),
    qHold(BONE.Head, [-13, 0, 0]),
    hipsBob([0, dur / 2, dur], [CROUCH_HIPS_DY, CROUCH_HIPS_DY + 0.02, CROUCH_HIPS_DY]),
  ];
  return new THREE.AnimationClip("CrouchWalk", dur, tracks);
}

function buildJump(): THREE.AnimationClip {
  // Anticipation crouch → explosive extension → tuck → reach for landing → absorb.
  const T = [0, 0.14, 0.34, 0.58, 0.8];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.LUpLeg, T, [[6, 0, 2], [40, 0, 2], [-10, 0, 2], [28, 0, 2], [14, 0, 2]]),
    qTrack(BONE.RUpLeg, T, [[6, 0, -2], [40, 0, -2], [-10, 0, -2], [28, 0, -2], [14, 0, -2]]),
    qTrack(BONE.LLeg, T, [[-14, 0, 0], [-64, 0, 0], [-6, 0, 0], [-52, 0, 0], [-30, 0, 0]]),
    qTrack(BONE.RLeg, T, [[-14, 0, 0], [-64, 0, 0], [-6, 0, 0], [-52, 0, 0], [-30, 0, 0]]),
    qTrack(BONE.LFoot, T, [[6, 0, 0], [24, 0, 0], [-14, 0, 0], [18, 0, 0], [8, 0, 0]]),
    qTrack(BONE.RFoot, T, [[6, 0, 0], [24, 0, 0], [-14, 0, 0], [18, 0, 0], [8, 0, 0]]),
    qTrack(BONE.LArm, T, [[10, 0, 6], [-44, 0, 10], [-96, 0, 14], [-40, 0, 10], [12, 0, 6]]),
    qTrack(BONE.RArm, T, [[10, 0, -6], [-44, 0, -10], [-96, 0, -14], [-40, 0, -10], [12, 0, -6]]),
    qTrack(BONE.LForeArm, T, [[-16, 0, 0], [-30, 0, 0], [-20, 0, 0], [-26, 0, 0], [-16, 0, 0]]),
    qTrack(BONE.RForeArm, T, [[-16, 0, 0], [-30, 0, 0], [-20, 0, 0], [-26, 0, 0], [-16, 0, 0]]),
    qTrack(BONE.Spine, T, [[9, 0, 0], [16, 0, 0], [-8, 0, 0], [8, 0, 0], [9, 0, 0]]),
    hipsBob(T, [0, -0.11, 0.06, -0.03, 0]),
  ];
  return new THREE.AnimationClip("Jump", 0.8, tracks);
}

function buildFall(): THREE.AnimationClip {
  // Airborne: arms up for balance, legs reaching down, a subtle windmill drift.
  const T = [0, 0.3, 0.6];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.LArm, T, [[-104, 0, 22], [-116, 0, 26], [-104, 0, 22]]),
    qTrack(BONE.RArm, T, [[-104, 0, -22], [-116, 0, -26], [-104, 0, -22]]),
    qHold(BONE.LForeArm, [-34, 0, 0]),
    qHold(BONE.RForeArm, [-34, 0, 0]),
    qTrack(BONE.LUpLeg, T, [[8, 0, 2], [18, 0, 2], [8, 0, 2]]),
    qTrack(BONE.RUpLeg, T, [[16, 0, -2], [6, 0, -2], [16, 0, -2]]),
    qHold(BONE.LLeg, [-16, 0, 0]),
    qHold(BONE.RLeg, [-22, 0, 0]),
    qHold(BONE.LFoot, [12, 0, 0]),
    qHold(BONE.RFoot, [12, 0, 0]),
    qTrack(BONE.Spine, T, [[-6, 0, 0], [-6, 4, 0], [-6, 0, 0]]),
    qHold(BONE.Head, [6, 0, 0]),
  ];
  return new THREE.AnimationClip("Fall", 0.6, tracks);
}

function buildTurn(name: "TurnLeft" | "TurnRight", sign: number): THREE.AnimationClip {
  // A weight-shifting step-turn in place: lead with the head + thorax, pelvis follows, a small dip.
  const T = [0, 0.3, 0.6];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.Spine, T, [[1, 0, 0], [2, 10 * sign, 2 * sign], [1, 0, 0]]),
    qTrack(BONE.Spine1, T, [[0, 0, 0], [0, 6 * sign, 0], [0, 0, 0]]),
    qTrack(BONE.Hips, T, [[0, 0, 0], [0, 7 * sign, -1 * sign], [0, 0, 0]]),
    qTrack(BONE.Head, T, [[0, 0, 0], [0, 16 * sign, 0], [0, 0, 0]]),
    qTrack(BONE.LArm, T, [[3, 0, 7], [5, 0, 9], [3, 0, 7]]),
    qTrack(BONE.RArm, T, [[3, 0, -7], [5, 0, -9], [3, 0, -7]]),
    qHold(BONE.LForeArm, [-12, 0, 0]),
    qHold(BONE.RForeArm, [-12, 0, 0]),
    hipsBob(T, [0, -0.02, 0]),
  ];
  return new THREE.AnimationClip(name, 0.6, tracks);
}

function buildAim(): THREE.AnimationClip {
  // A committed two-handed aim toward -Z: right hand grips, left hand supports, thorax bladed,
  // head tracking down the sights. A faint settle keeps it from being a dead freeze.
  const T = [0, 0.5];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.RArm, T, [[-86, 0, -8], [-88, 0, -6]]),
    qTrack(BONE.RForeArm, T, [[-18, 10, 0], [-16, 12, 0]]),
    qHold(BONE.RShoulder, [0, 0, -6]),
    qHold(BONE.LArm, [-74, 0, 30]),
    qTrack(BONE.LForeArm, T, [[-46, -22, 0], [-44, -20, 0]]),
    qHold(BONE.LShoulder, [0, 0, 8]),
    qTrack(BONE.Spine, T, [[3, -12, 0], [3, -12, 0]]),
    qTrack(BONE.Spine2, T, [[0, -8, 0], [0, -8, 0]]),
    qTrack(BONE.Head, T, [[2, -8, 0], [2, -8, 0]]),
  ];
  return new THREE.AnimationClip("Aim", 0.5, tracks);
}

function buildWave(): THREE.AnimationClip {
  const T = [0, 0.3, 0.6, 0.9, 1.2];
  const tracks: THREE.KeyframeTrack[] = [
    qHold(BONE.RArm, [-40, 0, -120]),
    qTrack(BONE.RForeArm, T, [[-10, 0, -20], [-10, 0, 20], [-10, 0, -20], [-10, 0, 20], [-10, 0, -20]]),
    qHold(BONE.Head, [0, -8, 0]),
  ];
  return new THREE.AnimationClip("Wave", 1.2, tracks);
}

/** Build every clip in the shared library. Names line up with AnimState. */
export function buildLibraryClips(): THREE.AnimationClip[] {
  return [
    buildIdle(),
    buildGait("Walk", GAIT_PARAMS.Walk),
    buildGait("Run", GAIT_PARAMS.Run),
    buildGait("Sprint", GAIT_PARAMS.Sprint),
    buildCrouchIdle(),
    buildCrouchWalk(),
    buildJump(),
    buildFall(),
    buildTurn("TurnLeft", 1),
    buildTurn("TurnRight", -1),
    buildAim(),
    buildWave(),
  ];
}

/** Names of clips that should play once (not loop). */
export const ONE_SHOT_STATES: ReadonlySet<AnimState> = new Set<AnimState>(["Jump", "Wave"]);
