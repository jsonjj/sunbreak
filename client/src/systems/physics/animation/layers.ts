// Upper/lower body layering helpers (v2 seam). three.js has no native bone masks, so we build
// track-filtered clip variants and additive offsets offline/once. The v0 locomotion driver does
// not use these yet, but combat aim-while-move overlays will (see animation-system.md §Layers).

import { AnimationClip, AnimationUtils } from "three";
import { UPPER_BONES } from "./constants";

/** Clip containing only upper-body (spine→head + arms/hands) tracks. */
export const maskUpper = (clip: AnimationClip): AnimationClip =>
  new AnimationClip(
    `${clip.name}_U`,
    clip.duration,
    clip.tracks.filter((t) => UPPER_BONES.test(t.name)),
  );

/** Clip containing only lower-body (hips/legs/feet + root) tracks. */
export const maskLower = (clip: AnimationClip): AnimationClip =>
  new AnimationClip(
    `${clip.name}_L`,
    clip.duration,
    clip.tracks.filter((t) => !UPPER_BONES.test(t.name)),
  );

/**
 * Build an additive, upper-masked aim-pose offset. Keyframes become relative to the pose's
 * reference frame, so blending it at weight = aim-amount layers aiming on top of any lower-body
 * locomotion without a combinatorial clip explosion.
 */
export function additiveUpperOffset(pose: AnimationClip): AnimationClip {
  const upper = maskUpper(pose);
  AnimationUtils.makeClipAdditive(upper);
  return upper;
}
