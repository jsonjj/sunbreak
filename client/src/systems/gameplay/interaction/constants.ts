// Tunables + shared bitmasks for the interaction subsystem.

import { InputAction, Layer, interactionGroups } from "@sunbreak/shared";
import type { InteractionKind } from "./types";

/** Focus arbitration runs at ~15 Hz (spec) — plenty responsive, cheap. */
export const FOCUS_HZ = 15;
export const FOCUS_INTERVAL = 1 / FOCUS_HZ;

/** Scoring weights: priority dominates, then facing alignment, then a mild distance penalty. */
export const SCORE_WEIGHTS = { priority: 10, align: 2, distance: 0.5 } as const;

/** Fallback detection radius (m) when a config / handler doesn't specify one. */
export const DEFAULT_RANGE = 2.5;

/** Per-kind default detection radius (m). */
export const KIND_RANGE: Record<string, number> = {
  vehicle_enter: 3.0,
  item_pickup: 1.8,
  door: 2.2,
  npc_talk: 2.6,
  shop_buy: 2.6,
};

/** Key glyphs shown in prompts (Kenney/Xelu CC0 glyph names map 1:1 to these). */
export const PRIMARY_KEY_GLYPH = "E";
export const SECONDARY_KEY_GLYPH = "F";

/** Logical actions resolved by the shared InputManager (E = Interact, F = Enter/Exit). */
export const PRIMARY_ACTION = InputAction.Interact;
export const SECONDARY_ACTION = InputAction.EnterExitVehicle;

/** Per-entity cooldown (s) after a successful dispatch to prevent double-fire. */
export const INTERACT_COOLDOWN = 0.35;

/** Max crosshair pick distance (m) for `requiresAim` interactables. */
export const AIM_MAX_DISTANCE = 4.0;

/** Only dispatch while the pointer is locked (i.e. actually in-game, not in a menu). */
export const REQUIRE_POINTER_LOCK = true;

/** Cast a single line-of-sight ray to the winning candidate when Rapier is available. */
export const ENABLE_LOS = true;

/** Hysteresis (m) so objects hovering at the range boundary don't flicker in/out of range. */
export const STALE_RANGE_SLOP = 0.5;

/** Approx. eye height (m) above the player origin used for LOS ray + fallback focus origin. */
export const EYE_HEIGHT = 1.4;

/** Interactable sensor colliders live in the TRIGGER layer and only detect PLAYER + VEHICLE. */
export const INTERACTABLE_SENSOR_GROUPS = interactionGroups(
  [Layer.TRIGGER],
  [Layer.PLAYER, Layer.VEHICLE],
);

/** LOS ray belongs to PROJECTILE (which WORLD collides with) and only tests WORLD geometry. */
export const LOS_QUERY_GROUPS = interactionGroups([Layer.PROJECTILE], [Layer.WORLD]);

/** Aim raycast only considers interactable sensors. */
export const AIM_QUERY_GROUPS = interactionGroups([Layer.PLAYER], [Layer.TRIGGER]);

/** Resolve the effective detection radius for a kind, honouring a per-instance override. */
export function rangeFor(kind: InteractionKind, override?: number): number {
  if (typeof override === "number") return override;
  return KIND_RANGE[kind] ?? DEFAULT_RANGE;
}
