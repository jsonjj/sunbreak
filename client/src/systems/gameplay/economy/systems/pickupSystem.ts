// Update-phase system: collect `econ_pickup` entities the player walks over and credit their
// cash, then despawn them. Inert (early-returns) until something spawns pickups via
// `economyApi.dropCash(...)`. Throttled to ~10 Hz — never per-frame proximity math.
import type { System } from "@sunbreak/shared";
import { queries } from "@/ecs/queries";
import { world } from "@/ecs/world";
import { PICKUP_RADIUS } from "../constants";
import { useEconomy } from "../store/economyStore";

type W = typeof world;

// Module-level query (created once, auto-maintained by the world).
const pickups = world.with("econ_pickup", "transform");

let acc = 0;
const RATE = 1 / 10;
const R2 = PICKUP_RADIUS * PICKUP_RADIUS;

export const pickupSystem: System<W> = {
  name: "econ.pickup",
  phase: "update",
  order: 50,
  fn: (w, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;
    if (pickups.entities.length === 0) return;

    const player = queries.players.entities[0];
    if (!player) return;
    const p = player.transform.position;

    // Snapshot because we mutate the query (remove) while iterating.
    for (const e of [...pickups.entities]) {
      const q = e.transform.position;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dz = q.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= R2) {
        useEconomy.getState().addMoney(e.econ_pickup.amount, { dirty: e.econ_pickup.dirty });
        w.remove(e);
      }
    }
  },
};
