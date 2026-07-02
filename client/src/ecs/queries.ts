import { world } from "./world";

/** Reused, module-level archetype queries (create once; iterate every frame). */
export const queries = {
  players: world.with("isPlayer", "transform"),
  movers: world.with("input", "rigidBody"),
  withBody: world.with("rigidBody", "transform"),
  alive: world.with("health").without("isDead"),
};
