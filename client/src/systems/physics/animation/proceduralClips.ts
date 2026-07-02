// Procedural, in-place locomotion clips authored on the Mixamo skeleton (`mixamorig:*`).
//
// WHY: the real Mixamo clip packs are binary .glb assets fetched offline via an Adobe account
// (royalty-free, not CC0) and are not committed to the repo. Until those are registered via
// `registerLocomotionClips`, these synthesized clips give the driver a real, testable end-to-end
// path (idle/walk/run/sprint) that binds to the shared rig by bone name — completely free and
// with zero binary assets. They are deliberately simple; real clips supersede them at load.

import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack } from "three";
import { CLIP, MIXAMO_PREFIX } from "./constants";

const TAU = Math.PI * 2;
const SAMPLES = 16; // per cycle; +1 closing keyframe makes the loop seamless

// Module-scope scratch — clip construction runs once at load, but stay allocation-lean anyway.
const _euler = new Euler();
const _quat = new Quaternion();

type EulerFn = (phase: number) => readonly [number, number, number];

interface BoneSpec {
  bone: string;
  euler: EulerFn;
}

function quatTrack(bone: string, times: number[], euler: EulerFn): QuaternionKeyframeTrack {
  const values = new Float32Array(times.length * 4);
  for (let i = 0; i < times.length; i++) {
    const phase = i / SAMPLES; // 0..1 across the cycle (i === SAMPLES closes the loop)
    const [x, y, z] = euler(phase);
    _euler.set(x, y, z);
    _quat.setFromEuler(_euler);
    const o = i * 4;
    values[o] = _quat.x;
    values[o + 1] = _quat.y;
    values[o + 2] = _quat.z;
    values[o + 3] = _quat.w;
  }
  return new QuaternionKeyframeTrack(`${MIXAMO_PREFIX}${bone}.quaternion`, times, values);
}

function buildCyclicClip(name: string, duration: number, specs: readonly BoneSpec[]): AnimationClip {
  const times: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) times.push((i / SAMPLES) * duration);
  const tracks = specs.map((s) => quatTrack(s.bone, times, s.euler));
  // No Hips position track → the clip is inherently in-place (Rapier owns world translation).
  return new AnimationClip(name, duration, tracks);
}

interface GaitShape {
  duration: number;
  legAmp: number;
  kneeAmp: number;
  armAmp: number;
  foreArmAmp: number;
  spineAmp: number;
}

function gaitClip(name: string, s: GaitShape): AnimationClip {
  const leg = (off: number): EulerFn => (p) => [s.legAmp * Math.sin(TAU * (p + off)), 0, 0];
  const knee = (off: number): EulerFn => (p) => [
    s.kneeAmp * (0.5 - 0.5 * Math.cos(TAU * (p + off))),
    0,
    0,
  ];
  const arm = (off: number): EulerFn => (p) => [-s.armAmp * Math.sin(TAU * (p + off)), 0, 0];
  const foreArm = (off: number): EulerFn => (p) => [
    s.foreArmAmp * (0.5 - 0.5 * Math.cos(TAU * (p + off))),
    0,
    0,
  ];

  return buildCyclicClip(name, s.duration, [
    { bone: "LeftUpLeg", euler: leg(0) },
    { bone: "RightUpLeg", euler: leg(0.5) },
    { bone: "LeftLeg", euler: knee(0.5) },
    { bone: "RightLeg", euler: knee(0) },
    { bone: "LeftArm", euler: arm(0) },
    { bone: "RightArm", euler: arm(0.5) },
    { bone: "LeftForeArm", euler: foreArm(0) },
    { bone: "RightForeArm", euler: foreArm(0.5) },
    // Slight vertical bounce (double frequency) + counter-twist through the spine.
    {
      bone: "Spine1",
      euler: (p) => [s.spineAmp * Math.sin(TAU * 2 * p), s.spineAmp * 0.6 * Math.sin(TAU * p), 0],
    },
  ]);
}

function idleClip(): AnimationClip {
  return buildCyclicClip(CLIP.idle, 4, [
    { bone: "Spine1", euler: (p) => [0.03 * Math.sin(TAU * p), 0, 0] },
    { bone: "Spine2", euler: (p) => [0.02 * Math.sin(TAU * p), 0, 0] },
    { bone: "Head", euler: (p) => [0.015 * Math.sin(TAU * p), 0.02 * Math.sin(TAU * 0.5 * p), 0] },
    { bone: "LeftArm", euler: (p) => [0.02 * Math.sin(TAU * p), 0, 0] },
    { bone: "RightArm", euler: (p) => [0.02 * Math.sin(TAU * (p + 0.5)), 0, 0] },
  ]);
}

/**
 * Build the full procedural locomotion set (idle/walk/run/sprint). Cadence rises and stride
 * shortens per gait; the driver's timeScale sync then matches cadence to actual ground speed.
 */
export function buildProceduralLocomotionClips(): AnimationClip[] {
  return [
    idleClip(),
    gaitClip(CLIP.walk, {
      duration: 1.05,
      legAmp: 0.35,
      kneeAmp: 0.45,
      armAmp: 0.2,
      foreArmAmp: 0.15,
      spineAmp: 0.03,
    }),
    gaitClip(CLIP.run, {
      duration: 0.72,
      legAmp: 0.6,
      kneeAmp: 0.8,
      armAmp: 0.42,
      foreArmAmp: 0.5,
      spineAmp: 0.05,
    }),
    gaitClip(CLIP.sprint, {
      duration: 0.55,
      legAmp: 0.78,
      kneeAmp: 1.05,
      armAmp: 0.55,
      foreArmAmp: 0.7,
      spineAmp: 0.07,
    }),
  ];
}
