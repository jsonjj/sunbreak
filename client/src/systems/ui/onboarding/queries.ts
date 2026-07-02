// Reusable miniplex archetype queries for onboarding. Created once, iterated every frame.
// We only ever READ v0 entities (the local player) and READ/WRITE our own `onb_*` props.
import { world } from "@/ecs/world";
import "./onboarding.components";

export const onbQueries = {
  /** The local player (spawned by v0 factories) — used for zone/distance triggers. */
  player: world.with("isPlayer", "transform"),
  /** Live intro waypoints. */
  markers: world.with("onb_marker", "transform"),
  /** Live, un-destroyed can targets (rendered + raycast by the CanvasLayer). */
  targets: world.with("onb_target", "transform").without("onb_hit"),
  /** Everything the intro slice spawned (for teardown). */
  intro: world.with("onb_intro"),
};
