// Wraps an AnimationMixer with a small crossfade state machine and a locomotion selector driven from
// a 0..1 speed scalar. This is the "shared animator" every character (lead, ped, police) uses.
//
// Polish over a plain crossfade:
//  • gait→gait switches CARRY the stride phase (the incoming Walk/Run/Sprint action starts at the
//    same normalized cycle time as the outgoing one) so feet never snap back to phase 0 mid-step;
//  • hysteresis on the gait thresholds stops flicker when speed hovers on a boundary;
//  • timeScale stays synced to ground speed (GAIT_NOMINAL_SPEED) so feet don't slide;
//  • a light post-mixer OVERLAY adds life the baked clips can't know about: the head/torso lead into
//    turns (from the model's yaw rate) and lean into acceleration. Amplitudes are tiny + additive.
//
// NOTE: the ECS mixer system calls `instance.update(dt)` (see ecs/systems.ts) so the overlay runs;
// if you tick `mixer.update` directly you get the base clips without the overlay.

import * as THREE from "three";
import { SPRINT_SPEED, type LocomotionMode } from "@sunbreak/shared";
import type { AbilityId, AnimState } from "../types";
import { GAIT_NOMINAL_SPEED, ONE_SHOT_STATES } from "./proceduralClips";
import { BONE, type BoneName } from "./skeleton";

export interface Animator {
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Readonly<Record<string, THREE.AnimationAction | undefined>>;
  play(state: AnimState, fade?: number): void;
  setLocomotion(normalizedSpeed: number, grounded?: boolean, mode?: LocomotionMode): void;
  update(dt: number): void;
  setAbilityActive(active: boolean, abilityId?: AbilityId): void;
  readonly current: AnimState;
  dispose(): void;
}

const GAITS: ReadonlySet<AnimState> = new Set<AnimState>(["Walk", "Run", "Sprint"]);

// Gait thresholds (in normalizedSpeed = speed / SPRINT_SPEED) with a hysteresis dead-band so a
// speed hovering on a boundary doesn't flip-flop between clips.
const TH = {
  idleUp: 0.06,
  idleDown: 0.035,
  runUp: 0.46,
  runDown: 0.4,
  sprintUp: 0.82,
  sprintDown: 0.74,
} as const;

export function createAnimator(root: THREE.Object3D, clips: readonly THREE.AnimationClip[]): Animator {
  const mixer = new THREE.AnimationMixer(root);
  const actions: Record<string, THREE.AnimationAction | undefined> = {};
  for (const clip of clips) actions[clip.name] = mixer.clipAction(clip);

  let current: AnimState = "Idle";
  let abilityRate = 1;
  // Per-instance phase offset so a group of characters doesn't breathe/step in lockstep.
  const phaseSeed = Math.random();

  // ── Overlay bone cache (guarded — an external rig may not have every bone) ──
  const bones: Partial<Record<BoneName, THREE.Bone>> = {};
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) bones[b.name as BoneName] = b;
  });
  const _e = new THREE.Euler();
  const _inv = new THREE.Quaternion();
  // Overlay deltas applied last frame. We UNDO them before the next mixer.update so a bone the
  // current clip doesn't animate (e.g. Head during Jump) never accumulates the overlay — it's a true
  // additive layer on top of whatever the mixer wrote (or the rest pose).
  const applied: Array<{ bone: THREE.Bone; q: THREE.Quaternion }> = [];
  function clearOverlay(): void {
    for (let i = 0; i < applied.length; i++) {
      const a = applied[i]!;
      _inv.copy(a.q).invert();
      a.bone.quaternion.multiply(_inv);
    }
    applied.length = 0;
  }
  function pushOverlay(bone: BoneName, x: number, y: number, z: number): void {
    const b = bones[bone];
    if (!b || (x === 0 && y === 0 && z === 0)) return;
    _e.set(x, y, z, "XYZ");
    const q = new THREE.Quaternion().setFromEuler(_e);
    b.quaternion.multiply(q);
    applied.push({ bone: b, q });
  }

  let prevYaw = root.rotation.y;
  let yawRate = 0;
  let lastN = 0;
  let accel = 0;
  let groundedLoco = false;

  function normPhase(a: THREE.AnimationAction | undefined): number {
    if (!a) return 0;
    const dur = a.getClip().duration || 1;
    return (a.time % dur) / dur;
  }

  function play(state: AnimState, fade = 0.2): void {
    const next = actions[state];
    if (!next) return;
    const oneShot = ONE_SHOT_STATES.has(state);
    if (state === current && !oneShot && next.isRunning()) return;

    const prev = actions[current];
    // Carry stride phase across gait↔gait transitions so the feet don't reset mid-step.
    const carry = GAITS.has(state) && GAITS.has(current) && prev ? normPhase(prev) : -1;

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    if (oneShot) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (carry >= 0) {
      next.time = carry * (next.getClip().duration || 1);
    } else if (state === "Idle") {
      next.time = phaseSeed * (next.getClip().duration || 1);
    }
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    current = state;
  }

  function selectGait(n: number): AnimState {
    // Hysteresis: bias toward staying in the current gait until we cross the far threshold.
    const cur = current;
    const sprintTh = cur === "Sprint" ? TH.sprintDown : TH.sprintUp;
    const runTh = cur === "Run" || cur === "Sprint" ? TH.runDown : TH.runUp;
    if (n >= sprintTh) return "Sprint";
    if (n >= runTh) return "Run";
    return "Walk";
  }

  function setLocomotion(n: number, grounded = true, mode?: LocomotionMode): void {
    lastN = n;
    if (!grounded || mode === "fall") {
      groundedLoco = false;
      play("Fall", 0.16);
      return;
    }
    if (mode === "jump") {
      groundedLoco = false;
      play("Jump", 0.12);
      return;
    }
    if (mode === "crouch") {
      groundedLoco = false;
      play(n > 0.02 ? "CrouchWalk" : "CrouchIdle", 0.18);
      return;
    }

    groundedLoco = true;
    // Idle vs moving with hysteresis.
    const moving = current === "Idle" ? n >= TH.idleUp : n >= TH.idleDown;
    if (!moving) {
      play("Idle", 0.24);
      return;
    }
    const state = selectGait(n);
    // Shorter fade for adjacent gait swaps (phase is carried anyway); a touch longer from idle.
    const fade = current === "Idle" ? 0.22 : 0.14;
    play(state, fade);
    const a = actions[state];
    if (a) {
      const speed = n * SPRINT_SPEED;
      const nominal = GAIT_NOMINAL_SPEED[state] ?? speed;
      const ts = THREE.MathUtils.clamp(speed / nominal, 0.6, 1.7);
      a.setEffectiveTimeScale(ts * abilityRate);
    }
  }

  function setAbilityActive(active: boolean, _abilityId?: AbilityId): void {
    // Tuning (charge, postfx strength) is owned by combat/driving; we only bump the anim rate.
    abilityRate = active ? 1.18 : 1;
    const a = actions[current];
    if (a && !ONE_SHOT_STATES.has(current)) a.setEffectiveTimeScale(abilityRate);
  }

  // Additive, tiny "aliveness" pass applied AFTER the mixer writes the base pose each frame.
  function applyOverlay(dt: number): void {
    if (dt <= 0) return;
    // Yaw rate from the model's facing (drive system sets root.rotation.y each frame).
    let dYaw = root.rotation.y - prevYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    prevYaw = root.rotation.y;
    const targetYawRate = THREE.MathUtils.clamp(dYaw / dt, -6, 6);
    yawRate += (targetYawRate - yawRate) * Math.min(1, dt * 12);

    // Lead the look/torso into turns; lean the torso into acceleration. Combine per-bone so each
    // gets a single delta (kept undo-able for the next frame).
    const turn = THREE.MathUtils.clamp(yawRate * 0.05, -0.2, 0.2);
    const lean = groundedLoco ? accel : 0;
    pushOverlay(BONE.Head, 0, turn * 0.9, -turn * 0.5);
    pushOverlay(BONE.Spine2, 0, turn * 0.35, 0);
    pushOverlay(BONE.Spine, lean, turn * 0.15, 0);
    pushOverlay(BONE.Spine1, lean * 0.5, 0, 0);
  }

  // Track acceleration between locomotion updates (setLocomotion runs before update in the ECS).
  let prevNForAccel = 0;
  function update(dt: number): void {
    clearOverlay(); // undo last frame's additive layer before the mixer writes the base pose
    mixer.update(dt);
    if (dt > 0) {
      const a = THREE.MathUtils.clamp((lastN - prevNForAccel) / dt, -6, 6);
      accel += (a * 0.05 - accel) * Math.min(1, dt * 8); // smooth toward a small lean angle (rad)
      accel = THREE.MathUtils.clamp(accel, -0.14, 0.16);
      prevNForAccel = lastN;
    }
    applyOverlay(dt);
  }

  function dispose(): void {
    mixer.stopAllAction();
    mixer.uncacheRoot(root as THREE.Object3D);
  }

  play("Idle", 0);

  return {
    mixer,
    actions,
    play,
    setLocomotion,
    update,
    setAbilityActive,
    get current() {
      return current;
    },
    dispose,
  };
}
