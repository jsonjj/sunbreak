// Discrete-state crossfade helpers over drei/three AnimationActions. Used for one-shot / state
// transitions (jump, land, turn-in-place, upper overrides — v1/v2 seams). The continuous
// locomotion blend uses weighted co-playing actions instead (see locomotionController.ts).

import { LoopOnce } from "three";
import type { AnimationAction } from "three";

/** Crossfade from one action to another, warping so effective weights stay normalized. */
export function crossfade(from: AnimationAction, to: AnimationAction, duration = 0.2): void {
  if (from === to) return;
  to.reset();
  to.enabled = true;
  to.setEffectiveWeight(1);
  to.setEffectiveTimeScale(1);
  from.crossFadeTo(to, duration, true);
  to.play();
}

/** Fade an action in from zero weight without cutting whatever is currently playing. */
export function fadeIn(action: AnimationAction, duration = 0.2): void {
  action.enabled = true;
  action.reset();
  action.setEffectiveWeight(0);
  action.fadeIn(duration);
  action.play();
}

/** Fade an action out to zero weight (leaves it enabled for cheap re-entry). */
export function fadeOut(action: AnimationAction, duration = 0.2): void {
  action.fadeOut(duration);
}

/**
 * Play a non-looping one-shot (fire/reload/vault). Returns the action so callers can await its
 * `finished` mixer event. LoopOnce + clampWhenFinished keeps the last pose until faded out.
 */
export function playOneShot(action: AnimationAction, fadeInSec = 0.1): AnimationAction {
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = true;
  action.setLoop(LoopOnce, 1);
  action.setEffectiveWeight(1);
  action.fadeIn(fadeInSec);
  action.play();
  return action;
}
