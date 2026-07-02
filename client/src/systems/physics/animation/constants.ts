// Tuning + naming constants for the locomotion animation driver. Blend-tree positions and
// nominal speeds are anchored to the shared movement tuning so timeScale sync kills foot slide.

import { RUN_SPEED, SPRINT_SPEED, WALK_SPEED } from "@sunbreak/shared";
import type { AnimLocomotionConfig, GaitNode } from "./types";

/**
 * Every retargeted humanoid shares the Mixamo skeleton; all clips bind by these bone names.
 * NOTE: this is the *sanitized* prefix (no colon). three's GLTFLoader runs
 * `PropertyBinding.sanitizeNodeName()` on every node, stripping the reserved ':' — so a conformed
 * Mixamo/Quaternius GLB exposes bones like `mixamorigHips` at runtime. Hand-authored track names
 * must match that exactly (a `mixamorig:Hips` track silently fails to bind — "No target node found").
 */
export const MIXAMO_PREFIX = "mixamorig";

/**
 * Upper-body bone matcher for v2 upper/lower layering (aim-while-move). Kept here so the
 * mask helpers in `layers.ts` and any future combat overlay agree on the split.
 */
export const UPPER_BONES =
  /(Spine|Neck|Head|Shoulder|Arm|ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky)/;

/** Canonical clip registry keys the blend tree looks up. */
export const CLIP = {
  idle: "idle",
  walk: "walk",
  run: "run",
  sprint: "sprint",
} as const;

/** Speed used to normalize the blend-tree axis (matches `movement.normalizedSpeed`). */
export const NORMALIZED_SPEED_REF = SPRINT_SPEED;

/** Default 1-D locomotion blend tree. Positions are speed ratios against the sprint cap. */
export const DEFAULT_GAIT_NODES: readonly GaitNode[] = [
  { gait: "idle", pos: 0, nominalSpeed: 0, clip: CLIP.idle },
  { gait: "walk", pos: WALK_SPEED / SPRINT_SPEED, nominalSpeed: WALK_SPEED, clip: CLIP.walk },
  { gait: "run", pos: RUN_SPEED / SPRINT_SPEED, nominalSpeed: RUN_SPEED, clip: CLIP.run },
  { gait: "sprint", pos: 1, nominalSpeed: SPRINT_SPEED, clip: CLIP.sprint },
] as const;

/** Feel defaults applied when `attachLocomotion` is called without overrides. */
export const DEFAULT_LOCOMOTION_CONFIG: AnimLocomotionConfig = {
  clipSet: "default",
  fade: 0.2,
  weightDamp: 10,
  timeScaleSync: true,
  minTimeScale: 0.6,
  maxTimeScale: 1.8,
  rootMotion: "in-place",
};

/**
 * LOD tick intervals (seconds) indexed by `AnimLodTier`.
 * 0 near = every frame, 1 mid ≈ 30 Hz, 2 far ≈ 15 Hz, 3 = frozen.
 */
export const LOD_INTERVAL: readonly number[] = [0, 1 / 30, 1 / 15, Number.POSITIVE_INFINITY];

/** Below this speed the character is considered standing still (prevents idle jitter). */
export const IDLE_SPEED_EPSILON = 0.05;
