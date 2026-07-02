// Search behaviour: units that have lost the suspect sweep the area around the last-known
// position. We model the LKP "probability grid" as sampled points on a disc around the LKP
// (wider at higher tiers). Each searching unit is assigned a point; when it arrives or the
// point goes stale it samples a fresh one — a cheap, allocation-light diffusion around the LKP.
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { activePoliceQuery } from "./queries";
import { planarDist2 } from "./los";
import { SEARCH_RADIUS_M } from "./tuning";
import { useWantedStore } from "./store";

type W = typeof World;

const REACH_R2 = 4 * 4;

function sampleAround(cx: number, cz: number, radius: number): { x: number; z: number } {
  const ang = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius; // uniform over the disc
  return { x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r };
}

function assignPoint(e: ClientEntity, cx: number, cz: number, radius: number): void {
  const p = sampleAround(cx, cz, radius);
  const timer = 3 + Math.random() * 2.5;
  if (e.wanted_search) {
    e.wanted_search.lkpX = cx;
    e.wanted_search.lkpZ = cz;
    e.wanted_search.pointX = p.x;
    e.wanted_search.pointZ = p.z;
    e.wanted_search.timer = timer;
  } else {
    world.addComponent(e, "wanted_search", {
      lkpX: cx,
      lkpZ: cz,
      pointX: p.x,
      pointZ: p.z,
      timer,
    });
  }
}

export const searchSystem: System<W> = {
  name: "wanted/search",
  phase: "update",
  order: 38,
  fn: (_w, dt) => {
    const store = useWantedStore.getState();
    const lkp = store.lkp;
    if (!lkp) return;

    // Search radius widens with the star tier (harder to shake at higher heat).
    const radius = SEARCH_RADIUS_M * (0.6 + 0.1 * store.stars);

    for (const e of activePoliceQuery.entities) {
      if (e.wanted_police?.fsm !== "SEARCH" || e.wanted_roadblock !== undefined) continue;
      const up = e.transform?.position;
      if (!up) continue;

      const s = e.wanted_search;
      const reached = s ? planarDist2(up.x, up.z, s.pointX, s.pointZ) <= REACH_R2 : true;
      const stale = s ? s.timer <= 0 : true;
      if (!s || reached || stale) {
        assignPoint(e, lkp.x, lkp.z, radius);
      } else {
        s.timer -= dt;
      }
    }
  },
};
