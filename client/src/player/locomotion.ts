import type { LocomotionMode } from "@sunbreak/shared";

/** Per-frame locomotion state, mutated in place (alloc-free). The animation subsystem reads
 *  this directly; the HUD reads a throttled mirror via the ECS bridge. */
export interface LocomotionState {
  speed: number;
  normalizedSpeed: number; // 0..1 across walk/run/sprint
  mode: LocomotionMode;
  isMoving: boolean;
  isGrounded: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  isJumping: boolean;
  isFalling: boolean;
  verticalVelocity: number;
  facing: number;
  position: { x: number; y: number; z: number };
}

export const locomotion: LocomotionState = {
  speed: 0,
  normalizedSpeed: 0,
  mode: "idle",
  isMoving: false,
  isGrounded: false,
  isSprinting: false,
  isCrouching: false,
  isJumping: false,
  isFalling: false,
  verticalVelocity: 0,
  facing: 0,
  position: { x: 0, y: 0, z: 0 },
};

export function computeMode(s: {
  moving: boolean;
  grounded: boolean;
  vVel: number;
  crouch: boolean;
  sprint: boolean;
  walk: boolean;
}): LocomotionMode {
  if (!s.grounded) return s.vVel > 0 ? "jump" : "fall";
  if (s.crouch) return "crouch";
  if (!s.moving) return "idle";
  if (s.sprint) return "sprint";
  if (s.walk) return "walk";
  return "run";
}
