// Render-phase system: after the listener is updated, move every active emitter to its entity's
// transform and (de)activate voices by distance. Runs after `listenerSystem` (order 1 > 0) so it
// culls against the freshest listener position.
import type { System } from "@sunbreak/shared";
import type { world } from "@/ecs/world";
import { syncEmitters } from "../spatial/emitter";

type W = typeof world;

export const emitterSystem: System<W> = {
  name: "audioEmitters",
  phase: "render",
  order: 1,
  fn: () => {
    syncEmitters();
  },
};
