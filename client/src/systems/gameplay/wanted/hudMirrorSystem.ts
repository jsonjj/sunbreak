// Finish-phase mirror: publish the current star level to the SHARED central HUD store (`heat`)
// and onto the player ECS entity (`wanted_stars`) so the HUD/minimap and any other subsystem
// can read the wanted level without importing this one. Also maintains the `wanted_target` tag
// on the suspect while heat > 0. Throttled + no-op-skipped, matching the v0 hud-sync contract.
import type { HeatTier } from "@sunbreak/shared";
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { world } from "@/ecs/world";
import { useHudStore } from "@/stores/hud.store";
import { playerQuery } from "./queries";
import { useWantedStore } from "./store";
import { activeCount } from "./pool";

type W = typeof World;

const RATE = 1 / 10;
let acc = 0;
let lastStars = -1;

export const hudMirrorSystem: System<W> = {
  name: "wanted/hudMirror",
  phase: "finish",
  order: 20,
  fn: (_w, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;

    const store = useWantedStore.getState();
    const stars = store.stars;

    // Mirror onto the player entity for ECS consumers.
    const player = playerQuery.entities[0];
    if (player) {
      if (player.wanted_stars !== stars) {
        if (player.wanted_stars === undefined) world.addComponent(player, "wanted_stars", stars);
        else player.wanted_stars = stars;
      }
      const wanted = stars > 0;
      if (wanted && player.wanted_target === undefined) {
        world.addComponent(player, "wanted_target", true);
      } else if (!wanted && player.wanted_target !== undefined) {
        world.removeComponent(player, "wanted_target");
      }
    }

    // Keep the deployed-unit count fresh for the HUD/debug readouts.
    const units = activeCount();
    if (units !== store.activeUnits) store.setActiveUnits(units);

    // Mirror the star level into the shared central HUD store (skip no-op writes).
    if (stars !== lastStars) {
      lastStars = stars;
      useHudStore.getState().patch({ heat: stars as HeatTier });
    }
  },
};
