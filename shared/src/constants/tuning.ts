import type { Vec3Tuple } from "../types/math";

// Gameplay tuning. Feel constants live here so they're fast to iterate and identical on
// the (v4) server. Values from the character-controller plan.

/** World gravity applied to Rapier dynamic bodies. */
export const GRAVITY: Vec3Tuple = [0, -9.81, 0];

// --- On-foot locomotion -----------------------------------------------------------------
/** Manual gravity for the kinematic character controller (stronger than world g for feel). */
export const PLAYER_GRAVITY = -20;
export const WALK_SPEED = 2.0; // m/s
export const RUN_SPEED = 5.0; // m/s (default jog)
export const SPRINT_SPEED = 8.0; // m/s
export const CROUCH_SPEED = 1.4; // m/s
export const JUMP_SPEED = 7.0; // m/s
export const TERMINAL_FALL = -55; // m/s clamp
export const MOVE_ACCEL = 12; // damp rate toward target speed
export const COYOTE_TIME = 0.12; // s grace after leaving ground
export const JUMP_BUFFER = 0.12; // s buffered jump press

/** Player capsule dimensions (~1.8m tall standing). */
export const PLAYER_CAPSULE = {
  halfHeight: 0.6,
  radius: 0.3,
  crouchHalfHeight: 0.3,
  offset: 0.01, // controller skin gap
} as const;

/** Kinematic character-controller resolve params. */
export const CC_AUTOSTEP = { maxHeight: 0.35, minWidth: 0.2, includeDynamic: true } as const;
export const CC_SNAP_TO_GROUND = 0.3;
export const CC_MAX_SLOPE_CLIMB_DEG = 50;
export const CC_MIN_SLOPE_SLIDE_DEG = 40;
