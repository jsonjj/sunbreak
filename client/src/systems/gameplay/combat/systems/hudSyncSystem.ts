// FINISH-phase bridge: mirror the equipped weapon + ammo into the shared HUD store. Per the HUD
// read-model contract (`ui/menu-hud/lib/stores.ts`): `combat_* → weapon, ammoClip, ammoReserve`.
// Throttled + no-op-skipped, matching v0's hudSyncSystem / economy's walletSyncSystem.

import type { System } from "@sunbreak/shared";
import { queries } from "@/ecs/queries";
import { useHudStore } from "@/stores/hud.store";
import type { world } from "@/ecs/world";
import { readEquipped } from "../integrations/inventory";
import { HUD_SYNC_RATE } from "../constants";

type W = typeof world;

let acc = 0;
const last = { weapon: "\0", clip: -1, reserve: -1 };

export const combatHudSyncSystem: System<W> = {
  name: "combat.hudSync",
  phase: "finish",
  order: 20,
  fn: (_w, dt) => {
    acc += dt;
    if (acc < HUD_SYNC_RATE) return;
    acc = 0;

    const player = queries.players.entities[0];
    if (!player) return;
    const eq = readEquipped(player);
    if (!eq) return;

    const weapon = eq.name || eq.weaponId;
    const clip = eq.isMelee ? 0 : eq.mag;
    const reserve = eq.isMelee ? 0 : eq.reserve;
    if (weapon === last.weapon && clip === last.clip && reserve === last.reserve) return;

    last.weapon = weapon;
    last.clip = clip;
    last.reserve = reserve;
    useHudStore.getState().patch({ weapon, ammoClip: clip, ammoReserve: reserve });
  },
};
