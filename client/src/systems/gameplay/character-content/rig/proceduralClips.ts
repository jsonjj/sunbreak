// The shared clip library, authored in code against the canonical bone names. Because every biped
// (procedural or imported CC0 GLB) uses those exact names, ONE set of clips plays on all of them
// with zero retargeting. Motion applies real animation principles: contralateral arm/leg swing,
// smoothly-sampled sinusoidal drivers (no linear "robot" interpolation), a heel-strike→toe-off
// ankle roll, knee flex biased into swing, pelvic rotation + weight-shift sway, and a spine that
// counter-rotates the thorax against the pelvis.
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
const GAIT_SAMPLES = 24;

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
}

// Phase convention: the LEFT leg drives global phase p (heel-strike at p=0). Rotating a down-hanging
// limb by +X pitches it toward -Z (the model's forward), so +thigh = swing forward.
function legThigh(A: number): NumFn {
  return (p) => A * Math.cos(TAU * p); // +A forward at heel-strike, -A at toe-off
}
function legKnee(base: number, swing: number): NumFn {
  // Knee stays near-straight through stance, flexes through swing (peak ≈ p 0.75). Never hyperextends.
  return (p) => base + swing * Math.max(0, Math.sin(TAU * (p - 0.5))) ** 1.3;
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

  const tracks: THREE.KeyframeTrack[] = [
    // Legs — contralateral. Arm is counter to its OWN-side leg (so arm ↔ opposite leg swing).
    sampledQuat(BONE.LUpLeg, dur, (p) => [lThigh(p), 0, 0]),
    sampledQuat(BONE.RUpLeg, dur, (p) => [rThigh(p), 0, 0]),
    sampledQuat(BONE.LLeg, dur, (p) => [lKnee(p), 0, 0]),
    sampledQuat(BONE.RLeg, dur, (p) => [rKnee(p), 0, 0]),
    sampledQuat(BONE.LFoot, dur, (p) => [lFoot(p), 0, 0]),
    sampledQuat(BONE.RFoot, dur, (p) => [rFoot(p), 0, 0]),
    // Arms.
    sampledQuat(BONE.LArm, dur, (p) => [lArm(p), 0, 4]),
    sampledQuat(BONE.RArm, dur, (p) => [rArm(p), 0, -4]),
    sampledQuat(BONE.LForeArm, dur, (p) => [lElbow(p), 0, 0]),
    sampledQuat(BONE.RForeArm, dur, (p) => [rElbow(p), 0, 0]),
    // Spine: forward lean + thorax counter-rotation (against the pelvis) + slight breathing rise.
    sampledQuat(BONE.Spine, dur, (p) => [s.lean * 0.55, -s.pelvisYaw * 0.7 * Math.sin(TAU * p), 0]),
    sampledQuat(BONE.Spine1, dur, (p) => [s.lean * 0.3, -s.pelvisYaw * 0.4 * Math.sin(TAU * p), 0]),
    sampledQuat(BONE.Spine2, dur, (p) => [s.lean * 0.15, 0, 0]),
    // Head stays roughly level: counter a little of the hip bob and yaw.
    sampledQuat(BONE.Head, dur, (p) => [-s.lean * 0.25, -s.pelvisYaw * 0.15 * Math.sin(TAU * p), 0]),
    // Pelvis: yaw leads with the swing leg, tips slightly, and rolls toward the stance side.
    // Rotation-only (no Hips translation): the feet hang off the pelvis in this non-IK rig, so
    // translating the hips would drag both feet — the body's natural rise/fall instead emerges from
    // leg extension, and the Rapier capsule owns world position.
    sampledQuat(BONE.Hips, dur, (p) => [
      -s.lean * 0.15,
      s.pelvisYaw * Math.sin(TAU * p),
      -2 * Math.sin(TAU * p),
    ]),
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
    dur: 0.92, thigh: 25, kneeSwing: 52, kneeBase: 6, foot: 16,
    arm: 22, foreArmBase: 12, foreArmSwing: 8, lean: 4, pelvisYaw: 6,
  },
  Run: {
    dur: 0.62, thigh: 42, kneeSwing: 88, kneeBase: 12, foot: 26,
    arm: 48, foreArmBase: 58, foreArmSwing: 20, lean: 13, pelvisYaw: 8,
  },
  Sprint: {
    dur: 0.5, thigh: 55, kneeSwing: 104, kneeBase: 16, foot: 30,
    arm: 62, foreArmBase: 74, foreArmSwing: 22, lean: 21, pelvisYaw: 9,
  },
};

/** Gait clip name → authored ground speed (m/s). The animator syncs timeScale to actual speed. */
export const GAIT_NOMINAL_SPEED: Readonly<Record<string, number>> = {
  Walk: measureNominalSpeed(GAIT_PARAMS.Walk),
  Run: measureNominalSpeed(GAIT_PARAMS.Run),
  Sprint: measureNominalSpeed(GAIT_PARAMS.Sprint),
};

function buildIdle(): THREE.AnimationClip {
  // Relaxed stance: weight settled, subtle breathing rise, tiny weight-shift & head drift.
  const T = [0, 1, 2, 3, 4];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.Spine, T, [[1.5, 0, 0], [2.1, 0, 0], [1.5, 0, 0], [1.1, 0, 0], [1.5, 0, 0]]),
    qTrack(BONE.Spine1, T, [[0, 0, 0], [1.0, 0, 0.6], [0, 0, 0], [-0.8, 0, -0.6], [0, 0, 0]]),
    qTrack(BONE.Head, T, [[0, 0, 0], [-1, 3, 0], [0, 0, 0], [-1, -3, 0], [0, 0, 0]]),
    // Arms hang with a natural inward drape (slight abduction + constant elbow bend).
    qHold(BONE.LArm, [4, 0, 7]),
    qHold(BONE.RArm, [4, 0, -7]),
    qHold(BONE.LForeArm, [-11, 0, 0]),
    qHold(BONE.RForeArm, [-11, 0, 0]),
    hipsBob(T, [0, 0.008, 0, 0.006, 0]),
  ];
  return new THREE.AnimationClip("Idle", 4, tracks);
}

function buildJump(): THREE.AnimationClip {
  const T = [0, 0.15, 0.35, 0.6, 0.8];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.LUpLeg, T, [[0, 0, 0], [35, 0, 0], [-8, 0, 0], [24, 0, 0], [16, 0, 0]]),
    qTrack(BONE.RUpLeg, T, [[0, 0, 0], [35, 0, 0], [-8, 0, 0], [24, 0, 0], [16, 0, 0]]),
    qTrack(BONE.LLeg, T, [[10, 0, 0], [58, 0, 0], [4, 0, 0], [46, 0, 0], [28, 0, 0]]),
    qTrack(BONE.RLeg, T, [[10, 0, 0], [58, 0, 0], [4, 0, 0], [46, 0, 0], [28, 0, 0]]),
    qTrack(BONE.LArm, T, [[0, 0, 0], [40, 0, 0], [-60, 0, 0], [-30, 0, 0], [10, 0, 0]]),
    qTrack(BONE.RArm, T, [[0, 0, 0], [40, 0, 0], [-60, 0, 0], [-30, 0, 0], [10, 0, 0]]),
    qTrack(BONE.Spine, T, [[8, 0, 0], [18, 0, 0], [-6, 0, 0], [10, 0, 0], [8, 0, 0]]),
    hipsBob(T, [0, -0.12, 0.06, -0.02, 0]),
  ];
  return new THREE.AnimationClip("Jump", 0.8, tracks);
}

function buildFall(): THREE.AnimationClip {
  const T = [0, 0.3, 0.6];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.LArm, T, [[-70, 0, 20], [-80, 0, 24], [-70, 0, 20]]),
    qTrack(BONE.RArm, T, [[-70, 0, -20], [-80, 0, -24], [-70, 0, -20]]),
    qHold(BONE.LForeArm, [-30, 0, 0]),
    qHold(BONE.RForeArm, [-30, 0, 0]),
    qTrack(BONE.LUpLeg, T, [[10, 0, 0], [18, 0, 0], [10, 0, 0]]),
    qTrack(BONE.RUpLeg, T, [[14, 0, 0], [8, 0, 0], [14, 0, 0]]),
    qHold(BONE.LLeg, [18, 0, 0]),
    qHold(BONE.RLeg, [22, 0, 0]),
    qTrack(BONE.Spine, T, [[-6, 0, 0], [-6, 4, 0], [-6, 0, 0]]),
  ];
  return new THREE.AnimationClip("Fall", 0.6, tracks);
}

function buildTurn(name: "TurnLeft" | "TurnRight", sign: number): THREE.AnimationClip {
  const T = [0, 0.3, 0.6];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.Spine, T, [[0, 0, 0], [0, 8 * sign, 0], [0, 0, 0]]),
    qTrack(BONE.Hips, T, [[0, 0, 0], [0, 6 * sign, 0], [0, 0, 0]]),
    qTrack(BONE.Head, T, [[0, 0, 0], [0, 12 * sign, 0], [0, 0, 0]]),
    qHold(BONE.LArm, [4, 0, 4]),
    qHold(BONE.RArm, [4, 0, -4]),
  ];
  return new THREE.AnimationClip(name, 0.6, tracks);
}

function buildAim(): THREE.AnimationClip {
  const T = [0, 0.5];
  const tracks: THREE.KeyframeTrack[] = [
    qHold(BONE.RArm, [-88, 0, -6]),
    qTrack(BONE.RForeArm, T, [[-14, 8, 0], [-14, 10, 0]]),
    qHold(BONE.LArm, [-70, 0, 26]),
    qHold(BONE.LForeArm, [-40, -18, 0]),
    qTrack(BONE.Spine, T, [[2, -8, 0], [2, -8, 0]]),
    qTrack(BONE.Head, T, [[0, -6, 0], [0, -6, 0]]),
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
