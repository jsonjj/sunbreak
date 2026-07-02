// The shared clip library, authored in code against the canonical bone names. Because every biped
// (procedural or imported CC0 GLB) uses those exact names, ONE set of clips plays on all of them
// with zero retargeting. Motion applies light animation principles: contralateral arm/leg swing,
// eased extremes (slerp), anticipation before the jump, overlapping follow-through on the spine.

import * as THREE from "three";
import type { AnimState } from "../types";
import { BONE, restWorld, type BoneName } from "./skeleton";

const D2R = Math.PI / 180;

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

interface GaitParams {
  dur: number;
  leg: number;
  knee: number;
  arm: number;
  foreArm: number;
  lean: number;
  bob: number;
  roll: number;
}

// Phase keys at 0, ¼, ½, ¾, 1 of the cycle.
function buildGait(name: string, p: GaitParams): THREE.AnimationClip {
  const T = [0, 0.25, 0.5, 0.75, 1].map((x) => x * p.dur);
  const k = p.knee;
  const tracks: THREE.KeyframeTrack[] = [
    // thighs — contralateral swing
    qTrack(BONE.LUpLeg, T, [[p.leg, 0, 0], [0, 0, 0], [-p.leg, 0, 0], [0, 0, 0], [p.leg, 0, 0]]),
    qTrack(BONE.RUpLeg, T, [[-p.leg, 0, 0], [0, 0, 0], [p.leg, 0, 0], [0, 0, 0], [-p.leg, 0, 0]]),
    // knees — bend most on the up/back swing
    qTrack(BONE.LLeg, T, [[k * 0.3, 0, 0], [k, 0, 0], [k * 0.2, 0, 0], [k * 0.55, 0, 0], [k * 0.3, 0, 0]]),
    qTrack(BONE.RLeg, T, [[k * 0.2, 0, 0], [k * 0.55, 0, 0], [k * 0.3, 0, 0], [k, 0, 0], [k * 0.2, 0, 0]]),
    // arms — counter to the same-side leg
    qTrack(BONE.LArm, T, [[-p.arm, 0, 0], [0, 0, 0], [p.arm, 0, 0], [0, 0, 0], [-p.arm, 0, 0]]),
    qTrack(BONE.RArm, T, [[p.arm, 0, 0], [0, 0, 0], [-p.arm, 0, 0], [0, 0, 0], [p.arm, 0, 0]]),
    qHold(BONE.LForeArm, [-p.foreArm, 0, 0]),
    qHold(BONE.RForeArm, [-p.foreArm, 0, 0]),
    // spine — forward lean + counter-twist follow-through
    qTrack(BONE.Spine, T, [[p.lean, 5, 0], [p.lean, 0, 0], [p.lean, -5, 0], [p.lean, 0, 0], [p.lean, 5, 0]]),
    // hips — double-bob + slight roll
    hipsBob(T, [0, p.bob, 0, p.bob, 0]),
    qTrack(BONE.Hips, T, [[0, 0, p.roll], [0, 0, 0], [0, 0, -p.roll], [0, 0, 0], [0, 0, p.roll]]),
  ];
  return new THREE.AnimationClip(name, p.dur, tracks);
}

function buildIdle(): THREE.AnimationClip {
  const T = [0, 1, 2, 3, 4];
  const tracks: THREE.KeyframeTrack[] = [
    qTrack(BONE.Spine1, T, [[0, 0, 0], [1.6, 0, 0], [0, 0, 0], [-1.2, 0, 0], [0, 0, 0]]),
    qTrack(BONE.Head, T, [[0, 0, 0], [0, 3, 0], [0, 0, 0], [0, -3, 0], [0, 0, 0]]),
    qHold(BONE.LArm, [3, 0, 4]),
    qHold(BONE.RArm, [3, 0, -4]),
    qHold(BONE.LForeArm, [-8, 0, 0]),
    qHold(BONE.RForeArm, [-8, 0, 0]),
    hipsBob(T, [0, 0.006, 0, 0.006, 0]),
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
    buildGait("Walk", { dur: 1.0, leg: 25, knee: 30, arm: 18, foreArm: 12, lean: 3, bob: 0.02, roll: 3 }),
    buildGait("Run", { dur: 0.7, leg: 44, knee: 72, arm: 42, foreArm: 55, lean: 12, bob: 0.03, roll: 4 }),
    buildGait("Sprint", { dur: 0.56, leg: 54, knee: 86, arm: 54, foreArm: 68, lean: 20, bob: 0.035, roll: 5 }),
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
