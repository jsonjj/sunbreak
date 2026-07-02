// Public control API for OTHER subsystems (combat, peds, economy, wanted, inventory, debug) to
// drive vitals through proper armor/zone math + player invulnerability, without reaching into
// the ECS or the pure reducers directly. Combat/peds MAY also just decrement `entity.stat_health`
// — the vitals + death systems react either way — but this path is the supported, safe one.

import { useGameStore } from "@/stores/game.store";
import type { CharacterId } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import { getPlayer, hasVitals, readVitals, writeVitals } from "./entityVitals";
import { applyDamage, canSprint, clamp } from "./vitals";
import { isInvulnerable, requestRespawn } from "./deathRespawnSystem";
import { setEconomyBridge, setPoliceBridge } from "./interfaces";
import { useStatStore } from "./store";
import { ABILITY_MAX, ARMOR_TIERS, staminaMaxForSkill } from "./constants";
import type { ArmorTier } from "./constants";
import type { DamageEvent, StaminaIntent, Vitals } from "./types";

let godMode = false;

export function setGodMode(on: boolean): void {
  godMode = on;
}
export function isGodMode(): boolean {
  return godMode;
}

/**
 * Apply damage to ANY entity that has `stat_health` (player or ped). Armor absorbs first, hit
 * zones scale, and the player is skipped while god-mode or post-respawn invulnerability is on.
 * Death is picked up by the death system from the resulting `stat_health<=0`.
 */
export function damageEntity(
  entity: ClientEntity,
  event: DamageEvent,
  now: number = performance.now(),
): void {
  if (entity.stat_health === undefined) return;
  if (entity.isPlayer && (godMode || isInvulnerable(now))) return;
  writeVitals(entity, applyDamage(readVitals(entity), event, now));
}

/** Convenience: damage the local player. */
export function damagePlayer(event: DamageEvent): void {
  const p = getPlayer();
  if (p) damageEntity(p, event);
}

/** Instantly kill the player (debug / scripted). */
export function killPlayer(): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  const v = readVitals(p);
  writeVitals(p, { ...v, health: 0, alive: false, lastDamageAt: performance.now() });
}

/** Police/wanted entry point: send the player to jail (respawn at nearest police station). */
export function bustPlayer(): void {
  requestRespawn("busted");
}

/** Heal by an amount (snack), clamped to healthMax. No-op on the dead. */
export function heal(amount: number): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  const v = readVitals(p);
  if (!v.alive) return;
  writeVitals(p, { ...v, health: clamp(v.health + Math.max(0, amount), 0, v.healthMax) });
}

/** Full heal (medkit). */
export function fullHeal(): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  const v = readVitals(p);
  writeVitals(p, { ...v, health: v.healthMax });
}

/** Equip armor: raise to the tier value (or a raw number), capped at armorMax. */
export function addArmor(tier: ArmorTier | number): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  const v = readVitals(p);
  const value = typeof tier === "number" ? tier : ARMOR_TIERS[tier];
  writeVitals(p, { ...v, armor: clamp(Math.max(v.armor, value), 0, v.armorMax) });
}

/** Charge the special-ability meter (0..1). Combat/driving events call this. */
export function chargeAbility(amount: number): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  const v = readVitals(p);
  writeVitals(p, { ...v, ability: clamp(v.ability + amount, 0, ABILITY_MAX) });
}

/** Spend ability charge; returns false (and does nothing) if there isn't enough. */
export function useAbility(amount: number): boolean {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return false;
  const v = readVitals(p);
  if (v.ability < amount) return false;
  writeVitals(p, { ...v, ability: clamp(v.ability - amount, 0, ABILITY_MAX) });
  return true;
}

/** Set the active stamina intent (player controller: "sprint"; swimming/climbing systems). */
export function setIntent(intent: StaminaIntent): void {
  useStatStore.getState().setIntent(intent);
}

/** Set the Stamina skill (0..100) — raises staminaMax; economy/progression calls this. */
export function setStaminaSkill(skill: number): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  const v = readVitals(p);
  const staminaSkill = clamp(skill, 0, 100);
  writeVitals(p, {
    ...v,
    staminaSkill,
    stamina: Math.min(v.stamina, staminaMaxForSkill(staminaSkill)),
  });
}

/** Switch the controlled lead (routes through the game store so all listeners agree). */
export function switchCharacter(id: CharacterId): void {
  useGameStore.getState().switchCharacter(id);
}

export function getPlayerVitals(): Vitals | null {
  const p = getPlayer();
  return p && hasVitals(p) ? readVitals(p) : null;
}

/** Whether the player has enough stamina to sprint (controller should gate on this). */
export function canPlayerSprint(): boolean {
  const v = getPlayerVitals();
  return v ? canSprint(v) : true;
}

// Re-export the sibling-interface injectors + respawn/invuln helpers as part of the API surface.
export { setEconomyBridge, setPoliceBridge } from "./interfaces";
export { isInvulnerable, requestRespawn } from "./deathRespawnSystem";

/** Aggregate handle (also exposed on `window.__sunbreakStats` in dev for tuning cheats). */
export const statsApi = {
  damageEntity,
  damagePlayer,
  hurt: (amount: number) => damagePlayer({ amount }),
  killPlayer,
  bustPlayer,
  heal,
  fullHeal,
  addArmor,
  chargeAbility,
  useAbility,
  setIntent,
  setStaminaSkill,
  switchCharacter,
  getPlayerVitals,
  canPlayerSprint,
  setGodMode,
  isGodMode,
  god: (on = true) => setGodMode(on),
  requestRespawn,
  isInvulnerable,
  setEconomyBridge,
  setPoliceBridge,
};
