// UPDATE-phase housekeeping for the self-contained practice range: respawn downed targets after a
// delay so the range is always usable for validating hitscan/damage/VFX. (Peds + real actors are
// owned by their own subsystems; this only touches combat's own `combat_target` entities.)

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { TARGET_HEALTH, TARGET_RESPAWN_MS } from "../constants";

type W = typeof world;

const targets = world.with("combat_target", "stat_health", "transform");

export const targetSystem: System<W> = {
  name: "combat.targets",
  phase: "update",
  order: 2,
  fn: () => {
    const now = performance.now();
    for (const e of targets) {
      const deadAt = e.combat_deadAt ?? 0;
      if (deadAt <= 0) continue;
      if (now - deadAt < TARGET_RESPAWN_MS) continue;

      // Respawn in place.
      const home = e.combat_target!.home;
      e.transform!.position.x = home.x;
      e.transform!.position.y = home.y;
      e.transform!.position.z = home.z;
      const hp = e.stat_health!;
      hp.current = hp.max > 0 ? hp.max : TARGET_HEALTH;
      hp.armor = 0;
      e.combat_deadAt = 0;
      if (e.isDead) world.removeComponent(e, "isDead");
    }
  },
};
