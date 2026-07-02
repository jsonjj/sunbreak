// Damage / impact audio derived from the shared `health` component. Watches per-entity health
// deltas frame-to-frame: a drop plays a hurt/impact (louder with bigger hits); reaching zero
// plays death / body-fall. No event wiring required — combat just needs to mutate `health`.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { playEvent } from "../dispatch";

const hurtable = world.with("health");
const lastHealth = new WeakMap<ClientEntity, number>();

export const impactSystem: System<typeof world> = {
  name: "sfx.impacts",
  phase: "update",
  order: 12,
  fn: () => {
    for (const e of hurtable.entities) {
      const cur = e.health.current;
      const prev = lastHealth.get(e);
      lastHealth.set(e, cur);
      if (prev === undefined) continue; // first observation, no baseline yet

      const delta = prev - cur;
      if (delta <= 0.5) continue; // healed or unchanged
      if (e.sfx_muted) continue;

      const pos = e.transform?.position;
      const died = cur <= 0 && prev > 0;

      if (e.isPlayer) {
        playEvent(died ? "player_death" : "player_hurt");
      } else if (died) {
        playEvent("body_fall", { position: pos });
      } else {
        playEvent("impact_flesh", { position: pos, gain: Math.min(1, 0.4 + delta / 40) });
      }
    }
  },
};
