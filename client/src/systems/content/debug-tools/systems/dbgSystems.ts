// Registered ECS systems for the debug layer. These are no-ops unless a cheat has tagged an
// entity (the tags only exist while cheats are active), so they cost effectively nothing.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import "../debug.components";

type W = typeof world;

const godQuery = world.with("dbg_god", "health");

/** Invulnerability: keep any `dbg_god` entity topped to full health/armor every frame. Runs late
 *  in `update` so it wins over any damage applied earlier the same frame. */
export const godSystem: System<W> = {
  name: "dbg:god",
  phase: "update",
  order: 900,
  fn: () => {
    for (const e of godQuery) {
      e.health.current = e.health.max;
      if (e.health.armor < e.health.max) e.health.armor = e.health.max;
    }
  },
};

/** All systems this subsystem registers. */
export const dbgSystems: ReadonlyArray<System<W>> = [godSystem];
