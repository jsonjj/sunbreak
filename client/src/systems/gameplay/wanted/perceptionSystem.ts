// Staggered perception: each tick processes a round-robin slice of deployed units (budget
// MAX_LOS_RAYS_PER_FRAME) and marks `wanted_perception.lastSeenAt` when the suspect is inside
// the unit's sight cone AND line-of-sight is clear (or within point-blank sense range). This is
// the signal the pursuit/search/cooldown FSMs read to decide PURSUE vs SEARCH vs cooldown.
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { activePoliceQuery, playerQuery } from "./queries";
import { hasLineOfSight, inSightCone, planarDist2 } from "./los";
import { MAX_LOS_RAYS_PER_FRAME, PERCEPTION_HZ } from "./tuning";
import { useWantedStore } from "./store";
import { now } from "./clock";

type W = typeof World;

const RATE = 1 / PERCEPTION_HZ;
const POINT_BLANK = 7; // metres: a unit knows you're right there regardless of facing
let acc = 0;
let cursor = 0;

function eyeHeight(archetype: string | undefined): number {
  return archetype === "foot" ? 1.6 : 1.2;
}

export const perceptionSystem: System<W> = {
  name: "wanted/perception",
  phase: "update",
  order: 10,
  fn: (_w, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;

    const player = playerQuery.entities[0];
    const units = activePoliceQuery.entities;
    if (!player || units.length === 0) return;

    const pp = player.transform!.position;
    const t = now();
    const budget = Math.min(MAX_LOS_RAYS_PER_FRAME, units.length);
    let sawPlayer = false;

    for (let n = 0; n < budget; n++) {
      const u = units[(cursor + n) % units.length];
      if (!u || !u.transform || !u.wanted_perception) continue;
      if (u.wanted_roadblock !== undefined && u.wanted_police?.role === "blocker") {
        // roadblocks still watch, but only straight ahead — handled by the cone below
      }
      const up = u.transform.position;
      const perc = u.wanted_perception;
      const facing = u.movement?.facing ?? 0;

      const near = planarDist2(up.x, up.z, pp.x, pp.z) <= POINT_BLANK * POINT_BLANK;
      const inCone = inSightCone(up.x, up.z, facing, perc.fovDeg, perc.range, pp.x, pp.z);
      if (!near && !inCone) continue;

      const eh = eyeHeight(u.wanted_police?.archetype);
      if (near || hasLineOfSight(up.x, up.y + eh, up.z, pp.x, pp.y + 0.4, pp.z)) {
        perc.lastSeenAt = t;
        sawPlayer = true;
      }
    }

    cursor = (cursor + budget) % units.length;

    if (sawPlayer) {
      const st = useWantedStore.getState();
      st.setLkp({ x: pp.x, z: pp.z });
      if (st.searching) st.setSearching(false);
    }
  },
};
