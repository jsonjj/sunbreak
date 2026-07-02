// Public types for the physics/animation subsystem (locomotion blend-tree / mixer driver).
// Sim-side types here are serializable POJOs (safe as ECS components); live THREE refs live
// only inside the controller/driver store, never on the entity.

import type { LocomotionMode } from "@sunbreak/shared";

/** Canonical gaits the 1-D locomotion blend tree interpolates across (low → high speed). */
export type Gait = "idle" | "walk" | "run" | "sprint";

export const GAITS: readonly Gait[] = ["idle", "walk", "run", "sprint"] as const;

/**
 * Normalized, subsystem-agnostic locomotion sample the driver consumes each frame.
 *
 * This is the INPUT CONTRACT: it is derived from the shared ECS `movement` component
 * (primary) with the `velocity` component as an auxiliary source for planar direction /
 * speed fallback. The player controller and pedestrian AI both write those components, so
 * the exact same driver serves the player and every ped with no per-consumer glue.
 */
export interface LocomotionSample {
  /** Planar ground speed in m/s. */
  speed: number;
  /** 0..1 position on the idle→sprint axis (blend-tree parameter). */
  normalizedSpeed: number;
  /** Planar velocity X in m/s (reserved for 2-D strafe/turn blends in v1+). */
  vx: number;
  /** Planar velocity Z in m/s. */
  vz: number;
  /** Whether the character is on the ground (airborne freezes foot-cadence). */
  grounded: boolean;
  /** Discrete controller hint (idle/walk/run/sprint/jump/fall/crouch). */
  mode: LocomotionMode;
}

/** One stop of the 1-D locomotion blend tree. */
export interface GaitNode {
  gait: Gait;
  /** Position on the normalized-speed [0..1] axis. */
  pos: number;
  /** Clip's authored ground speed (m/s) used for timeScale sync; 0 disables sync (idle). */
  nominalSpeed: number;
  /** Clip registry key that supplies this node's `AnimationClip`. */
  clip: string;
}

/**
 * `anim_locomotion` ECS component (POJO). Its presence opts an entity into the locomotion
 * driver; the fields tune feel. Attach it via `attachLocomotion(entity, config)`.
 */
export interface AnimLocomotionConfig {
  /** Registered clip-set key (see `registerLocomotionClips`); defaults to "default". */
  clipSet: string;
  /** Crossfade seconds for discrete transitions (jump/land etc. — v1 seam). */
  fade: number;
  /** Exponential damping rate for blend weights (higher = snappier). */
  weightDamp: number;
  /** Sync clip timeScale to actual speed to reduce foot slide. */
  timeScaleSync: boolean;
  /** Clamp range for the synced timeScale. */
  minTimeScale: number;
  maxTimeScale: number;
  /** Root-motion policy. "in-place" = Rapier owns world position (v0 default). */
  rootMotion: "in-place";
}

/** Compact, serializable readout the driver writes back each frame (HUD / debug / v4 net). */
export interface AnimLocomotionReadout {
  /** Dominant gait this frame. */
  gait: Gait;
  speed: number;
  normalizedSpeed: number;
  grounded: boolean;
  /** Effective blend weights currently applied to the actions. */
  weights: { idle: number; walk: number; run: number; sprint: number };
  /** True once a mixer + clip actions are bound and ticking. */
  bound: boolean;
}

/**
 * `anim_lod` ECS component: crowd tick-rate tier the driver honors.
 * 0 = near (every frame), 1 = mid (~30 Hz), 2 = far (~15 Hz), 3 = frozen (skip update).
 * Owned by whoever knows camera distance / culling (peds / streaming); optional.
 */
export type AnimLodTier = 0 | 1 | 2 | 3;

/** Shape returned by `createCharacterAnimation` — mirrors drei `useAnimations` for easy reuse. */
export interface CharacterAnimation {
  mixer: import("three").AnimationMixer;
  actions: Partial<Record<string, import("three").AnimationAction>>;
  names: string[];
  clips: import("three").AnimationClip[];
}
