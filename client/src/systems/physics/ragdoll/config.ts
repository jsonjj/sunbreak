// physics/ragdoll — caps, LOD tiers, collision groups, and solver tuning.
//
// "Body count is the enemy": Rapier WASM comfortably simulates only single digits of awake full
// rigs at 60fps in Chrome. Everything here exists to keep us inside that budget: hard caps, a
// fixed pool, LOD downgrades, and self-collision-off groups.

import { Layer, interactionGroups } from "@sunbreak/shared";
import { useQuality } from "@/render/quality/useQuality";
import type { RagdollTier } from "./types";

/**
 * Ragdoll bodies are members of the PED layer but only collide with the static/props/vehicles
 * layers — NOT with each other, players, peds or projectiles. This disables self-collision
 * (halves solver work, removes limb jitter) and stops ragdolls from shoving the living.
 */
export const RAGDOLL_COLLISION_GROUPS = interactionGroups(
  [Layer.PED],
  [Layer.WORLD, Layer.VEHICLE, Layer.PROP, Layer.WATER],
);

/** Parked (disabled) rigs are shoved far below the world so a stray enable can't be seen. */
export const PARK_ORIGIN = { x: 0, y: -1000, z: 0 };
/** Horizontal spacing between parked rigs so their bodies never overlap while disabled. */
export const PARK_SPACING = 4;

export interface RagdollCaps {
  /** Max simultaneously-awake jointed rigs (Tier0/Tier1) near the player. */
  maxRagdolls: number;
  /** Max total awake ragdoll bodies (across all rigs). */
  maxAwakeBodies: number;
  /** Pre-built pool sizes per tier. */
  poolTier0: number;
  poolTier1: number;
  poolTier2: number;
}

/** High/full caps — the ceiling on a capable desktop/Chrome. */
export const BASE_CAPS: RagdollCaps = {
  maxRagdolls: 8,
  maxAwakeBodies: 80,
  poolTier0: 8,
  poolTier1: 4,
  poolTier2: 8,
};

// LOD distance bands (metres from the camera/player). Beyond TIER1 → Tier2 canned flop.
export const LOD_TIER0_MAX_M = 15;
export const LOD_TIER1_MAX_M = 35;

// Settle / lifecycle timing.
export const SETTLE_LINVEL = 0.14; // m/s — below this (and angvel) a rig is "resting"
export const SETTLE_ANGVEL = 0.4; // rad/s
export const SETTLE_FRAMES = 24; // consecutive resting frames → settled
export const CORPSE_LINGER_S = 8; // seconds a lethal corpse lingers before pool release
export const GETUP_S = 1.6; // survivable get-up hand-back duration (animation seam)
export const ACTIVATE_BLEND_S = 0.1; // anti-pop anim→physics cross-blend window

// Passive-pose plausibility (no motors): damping + limits + capsule shape bound the poses.
export const BODY_LINEAR_DAMPING = 0.25;
export const BODY_ANGULAR_DAMPING = 1.8;
export const BODY_FRICTION = 0.8;
export const BODY_RESTITUTION = 0.0;

/** Impulse (kg·m/s) applied to a lethal fall so corpses topple instead of dropping straight down. */
export const DEATH_TOPPLE_IMPULSE = 40;

/**
 * Quality-scaled caps. Low halves the caps and pulls Tier2 in sooner; High uses BASE_CAPS.
 * Reads the v0 render quality store defensively so a store refactor never crashes the ragdoll.
 */
export function scaledCaps(): RagdollCaps {
  let tier: string = "medium";
  try {
    tier = useQuality.getState().tier;
  } catch {
    /* store unavailable — keep default */
  }
  if (tier === "low") {
    return {
      maxRagdolls: 4,
      maxAwakeBodies: 40,
      poolTier0: 4,
      poolTier1: 3,
      poolTier2: 8,
    };
  }
  // medium & high both get the full ceiling (medium is the safe seed default).
  return BASE_CAPS;
}

/** Distance thresholds tighten on Low so distant deaths downgrade to canned clips sooner. */
export function lodBands(): { tier0: number; tier1: number } {
  let tier: string = "medium";
  try {
    tier = useQuality.getState().tier;
  } catch {
    /* keep default */
  }
  if (tier === "low") return { tier0: 8, tier1: 20 };
  return { tier0: LOD_TIER0_MAX_M, tier1: LOD_TIER1_MAX_M };
}

/** Pick an LOD tier from camera distance, honouring the (quality-scaled) bands. */
export function tierForDistance(distanceM: number): RagdollTier {
  const { tier0, tier1 } = lodBands();
  if (distanceM <= tier0) return 0;
  if (distanceM <= tier1) return 1;
  return 2;
}
