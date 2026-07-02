// Wraps an AnimationMixer with a small crossfade state machine and a locomotion blend driven from a
// 0..1 speed scalar. This is the "shared animator" every character (lead, ped, police) uses.

import * as THREE from "three";
import { SPRINT_SPEED, type LocomotionMode } from "@sunbreak/shared";
import type { AbilityId, AnimState } from "../types";
import { GAIT_NOMINAL_SPEED, ONE_SHOT_STATES } from "./proceduralClips";

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

export function createAnimator(root: THREE.Object3D, clips: readonly THREE.AnimationClip[]): Animator {
  const mixer = new THREE.AnimationMixer(root);
  const actions: Record<string, THREE.AnimationAction | undefined> = {};
  for (const clip of clips) actions[clip.name] = mixer.clipAction(clip);

  let current: AnimState = "Idle";
  // Ability visual hook: a small anim-rate multiplier applied on the next locomotion update.
  let abilityRate = 1;

  function play(state: AnimState, fade = 0.2): void {
    const next = actions[state];
    if (!next) return;
    const oneShot = ONE_SHOT_STATES.has(state);
    if (state === current && !oneShot && next.isRunning()) return;
    const prev = actions[current];
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
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    current = state;
  }

  function setLocomotion(n: number, grounded = true, mode?: LocomotionMode): void {
    if (!grounded || mode === "fall") {
      play("Fall", 0.15);
      return;
    }
    if (mode === "jump") {
      play("Jump", 0.1);
      return;
    }
    // Pick a gait, then sync its playback rate to the ground speed so the feet don't slide.
    // `n` is speed / SPRINT_SPEED (see movement.normalizedSpeed), so recover the real m/s and divide
    // by the clip's measured stride speed (GAIT_NOMINAL_SPEED). timeScale ≈ 1 near each gait's
    // natural pace; the clamp keeps extremes sane at crawl / over-speed.
    let state: AnimState;
    if (n < 0.06) state = "Idle";
    else if (n < 0.45) state = "Walk";
    else if (n < 0.8) state = "Run";
    else state = "Sprint";
    play(state, 0.2);
    if (state !== "Idle") {
      const a = actions[state];
      if (a) {
        const speed = n * SPRINT_SPEED;
        const nominal = GAIT_NOMINAL_SPEED[state] ?? speed;
        const ts = THREE.MathUtils.clamp(speed / nominal, 0.55, 1.7);
        a.setEffectiveTimeScale(ts * abilityRate);
      }
    }
  }

  function setAbilityActive(active: boolean, _abilityId?: AbilityId): void {
    // Tuning (charge, postfx strength) is owned by combat/driving; we only bump the anim rate.
    abilityRate = active ? 1.18 : 1;
    const a = actions[current];
    if (a && !ONE_SHOT_STATES.has(current)) a.setEffectiveTimeScale(abilityRate);
  }

  function update(dt: number): void {
    mixer.update(dt);
  }

  function dispose(): void {
    mixer.stopAllAction();
    mixer.uncacheRoot(root as THREE.Object3D);
  }

  // Start idle.
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
