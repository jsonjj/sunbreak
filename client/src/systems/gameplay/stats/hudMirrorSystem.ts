// HUD mirror (finish phase): push the player's vitals into (1) the shared `useHudStore` that the
// HUD reads for its health/armor/stamina/ability bars, and (2) the richer `useStatStore` for
// overlays (maxes, alive/exhausted/canSprint, damage-vignette timing). Throttled to HUD_SYNC_HZ.
//
// Runs at order 100 — AFTER the central hudSyncSystem (order 0). Because `writeVitals` mirrors
// stat_health into the v0 `health` component, the central system already shows the correct
// health; we re-assert it here (identical value → no flicker) and add armor/stamina/ability,
// which the central system never populates from the sim.

import type { System } from "@sunbreak/shared";
import type { world } from "@/ecs/world";
import { useHudStore } from "@/stores/hud.store";
import { HUD_SYNC_HZ, staminaMaxForSkill } from "./constants";
import { getPlayer, hasVitals, readVitals } from "./entityVitals";
import { useStatStore } from "./store";
import { canSprint, isExhausted, staminaFraction } from "./vitals";

type W = typeof world;

const RATE = 1 / HUD_SYNC_HZ;
let acc = 0;
const lastHud = { health: -1, armor: -1, stamina: -1, ability: -1 };

export const hudMirrorSystem: System<W> = {
  name: "stats:hudMirror",
  phase: "finish",
  order: 100,
  fn: (_world, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;

    const player = getPlayer();
    if (!player || !hasVitals(player)) return;
    const v = readVitals(player);
    const staminaMax = staminaMaxForSkill(v.staminaSkill);
    const frac = staminaFraction(v);

    // Quantized push to the shared HUD store (skip no-op writes).
    const health = Math.round(v.health);
    const armor = Math.round(v.armor);
    const staminaPct = Math.round(frac * 100);
    const ability = Math.round(v.ability * 100) / 100;
    if (
      health !== lastHud.health ||
      armor !== lastHud.armor ||
      staminaPct !== lastHud.stamina ||
      ability !== lastHud.ability
    ) {
      lastHud.health = health;
      lastHud.armor = armor;
      lastHud.stamina = staminaPct;
      lastHud.ability = ability;
      useHudStore.getState().patch({ health, armor, stamina: staminaPct, ability });
    }

    // Full-precision push to the stats store for overlays (per-field selectors gate re-renders).
    useStatStore.getState().patch({
      health: v.health,
      healthMax: v.healthMax,
      armor: v.armor,
      armorMax: v.armorMax,
      stamina: v.stamina,
      staminaMax,
      staminaFrac: frac,
      ability: v.ability,
      alive: v.alive,
      exhausted: isExhausted(v),
      canSprint: canSprint(v),
      lastDamageAt: v.lastDamageAt,
    });
  },
};
