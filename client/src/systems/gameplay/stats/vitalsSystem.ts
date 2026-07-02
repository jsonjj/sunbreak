// Per-frame player vitals tick (update phase): out-of-combat health regen, stamina drain/recover
// by intent, and fall damage. Runs before the death/respawn machine (order 10 < 20). All rates
// are per-second and dt-scaled; the heavy lifting is the pure reducers in `vitals.ts`.

import type { System } from "@sunbreak/shared";
import type { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { fallDamage, tickHealthRegen, tickStamina } from "./vitals";
import { ensurePlayerVitals, getPlayer, readVitals, writeVitals } from "./entityVitals";
import { getRespawnPhase } from "./deathRespawnSystem";
import { damageEntity } from "./bridge";
import { useStatStore } from "./store";
import type { StaminaIntent } from "./types";

type W = typeof world;

// Fall tracking derived off the ECS transform (decoupled from the controller's private velocity).
const fall = { prevY: null as number | null, minVy: 0, wasGrounded: true };
let prevHealth = Number.POSITIVE_INFINITY;

function resolveIntent(player: ClientEntity, storeIntent: StaminaIntent): StaminaIntent {
  // An explicit swim/climb/sprint intent (set by the controller/other systems) wins; otherwise
  // infer sprint from the locomotion mode already mirrored onto the entity.
  if (storeIntent !== "none") return storeIntent;
  return player.movement?.mode === "sprint" ? "sprint" : "none";
}

function resetFallTracking(): void {
  fall.prevY = null;
  fall.minVy = 0;
  fall.wasGrounded = true;
}

function handleFall(player: ClientEntity, now: number, dt: number): void {
  const y = player.transform?.position.y;
  if (y === undefined) return;
  const grounded = player.movement?.grounded ?? true;

  if (fall.prevY !== null && dt > 1e-4 && !grounded) {
    const vy = (y - fall.prevY) / dt; // negative while descending
    if (vy < fall.minVy) fall.minVy = vy;
  }
  if (grounded && !fall.wasGrounded) {
    const event = fallDamage(-fall.minVy); // impact speed = steepest descent
    if (event) damageEntity(player, event, now);
    fall.minVy = 0;
  }
  if (grounded) fall.minVy = 0;
  fall.wasGrounded = grounded;
  fall.prevY = y;
}

export const vitalsSystem: System<W> = {
  name: "stats:vitals",
  phase: "update",
  order: 10,
  fn: (_world, dt) => {
    const player = getPlayer();
    if (!player) return;
    ensurePlayerVitals(player);

    // Pause regen/stamina/fall while dead or reviving; reset fall tracking so the respawn
    // teleport can never be read as a fall on the first alive frame.
    if (getRespawnPhase() !== "alive") {
      resetFallTracking();
      prevHealth = Number.POSITIVE_INFINITY;
      return;
    }

    const now = performance.now();
    const dtMs = dt * 1000;
    let v = readVitals(player);

    // Robust combat cooldown: if health dropped since last frame (e.g. combat/peds decremented
    // stat_health directly instead of via damageEntity), stamp the damage time so regen waits.
    if (v.health < prevHealth) v.lastDamageAt = now;

    v = tickHealthRegen(v, dtMs, now);
    v = tickStamina(v, dtMs, resolveIntent(player, useStatStore.getState().intent));

    writeVitals(player, v);
    prevHealth = v.health;

    handleFall(player, now, dt);
  },
};
