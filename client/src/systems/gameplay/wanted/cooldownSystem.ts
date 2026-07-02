// Cooldown: while NO unit holds line-of-sight and the suspect is clear of the pursuit, run the
// tier's uncontested clear timer; flag `searching` (the HUD's white→gray blink) and drop one
// star when it expires. Any fresh sighting (or a unit right on top of the player) resets it.
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { activePoliceQuery, playerQuery } from "./queries";
import { COOLDOWN_S, LOS_LOST_GRACE } from "./tuning";
import { useWantedStore } from "./store";
import { releaseAll } from "./pool";
import { planarDist2 } from "./los";
import { now } from "./clock";

type W = typeof World;

const CLOSE_CONTACT = 14; // metres: a unit this close counts as holding contact

let timer = 0;

export const cooldownSystem: System<W> = {
  name: "wanted/cooldown",
  phase: "update",
  order: 50,
  fn: (_w, dt) => {
    const store = useWantedStore.getState();
    const stars = store.stars;
    if (stars === 0) {
      if (store.searching) store.setSearching(false);
      timer = 0;
      return;
    }

    const player = playerQuery.entities[0];
    const pp = player?.transform?.position;
    const t = now();

    let contested = false;
    for (const e of activePoliceQuery.entities) {
      const perc = e.wanted_perception;
      if (perc && t - perc.lastSeenAt < LOS_LOST_GRACE) {
        contested = true;
        break;
      }
      if (pp && e.transform) {
        const up = e.transform.position;
        if (planarDist2(up.x, up.z, pp.x, pp.z) <= CLOSE_CONTACT * CLOSE_CONTACT) {
          contested = true;
          break;
        }
      }
    }

    if (contested) {
      if (store.searching) store.setSearching(false);
      timer = COOLDOWN_S[stars] ?? 30;
      return;
    }

    if (!store.searching) {
      store.setSearching(true);
      timer = COOLDOWN_S[stars] ?? 30;
    }

    timer -= dt;
    if (timer <= 0) {
      store.decayStar();
      const next = useWantedStore.getState().stars;
      if (next === 0) {
        releaseAll();
      } else {
        timer = COOLDOWN_S[next] ?? 30;
      }
    }
  },
};
