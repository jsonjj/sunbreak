import type { System } from "@sunbreak/shared";
import { queries } from "../ecs/queries";
import type { world } from "../ecs/world";
import { useHudStore } from "../stores/hud.store";

type W = typeof world;

const RATE = 1 / 10; // ~10 Hz
let acc = 0;
const last = { health: -1, speedKmh: -1 };

/** Finish-phase system: mirror quantized player values into the HUD store (skip no-op writes). */
export const hudSyncSystem: System<W> = {
  name: "hudSync",
  phase: "finish",
  fn: (_world, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;

    const player = queries.players.entities[0];
    if (!player) return;

    const health = Math.round(player.health?.current ?? 0);
    const speedKmh = Math.round((player.movement?.speed ?? 0) * 3.6);
    if (health === last.health && speedKmh === last.speedKmh) return;

    last.health = health;
    last.speedKmh = speedKmh;
    useHudStore.getState().patch({ health, speedKmh });
  },
};
