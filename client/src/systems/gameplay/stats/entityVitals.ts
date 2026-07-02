// The ECS <-> Vitals bridge: read/write the flat `stat_*` components on an entity, install them
// first-time (so archetype queries pick the entity up), and handle player-specific concerns
// (find, teleport, death tagging, per-character snapshot/switch). `stat_*` is the authority;
// we also MIRROR into the v0 `health` component so the existing central HUD sync and any v0
// consumer (e.g. `queries.alive`) stay correct without editing v0 code.

import { world } from "@/ecs/world";
import { queries } from "@/ecs/queries";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { CharacterId, Vec3 } from "@sunbreak/shared";
import { MAX_ARMOR, MAX_HEALTH, staminaMaxForSkill } from "./constants";
import { freshVitals } from "./vitals";
import { getActiveCharacter, getCharacter, setActiveCharacter, setCharacter } from "./characters";
import type { Vitals } from "./types";

/** The local player entity (or undefined before it spawns). */
export function getPlayer(): ClientEntity | undefined {
  return queries.players.entities[0];
}

export function hasVitals(e: ClientEntity): boolean {
  return e.stat_health !== undefined;
}

/** Read the flat `stat_*` fields into a working Vitals struct (with sane defaults). */
export function readVitals(e: ClientEntity): Vitals {
  const staminaSkill = e.stat_staminaSkill ?? 0;
  const hp = e.stat_health;
  const healthMax = hp?.max ?? e.stat_healthMax ?? MAX_HEALTH;
  const health = hp?.current ?? healthMax;
  return {
    health,
    healthMax,
    armor: hp?.armor ?? e.stat_armor ?? 0,
    armorMax: e.stat_armorMax ?? MAX_ARMOR,
    stamina: e.stat_stamina ?? staminaMaxForSkill(staminaSkill),
    staminaSkill,
    ability: e.stat_ability ?? 0,
    alive: e.stat_dead ? false : health > 0,
    lastDamageAt: e.stat_lastDamageAt ?? 0,
  };
}

/** Write a Vitals struct back to the flat `stat_*` fields (+ mirror the v0 `health` component). */
export function writeVitals(e: ClientEntity, v: Vitals): void {
  // `stat_health` is the canonical `Health` blob combat/peds mutate — mutate in place to avoid
  // per-frame allocation and keep object identity stable for other readers.
  if (e.stat_health) {
    e.stat_health.current = v.health;
    e.stat_health.max = v.healthMax;
    e.stat_health.armor = v.armor;
  } else {
    e.stat_health = { current: v.health, max: v.healthMax, armor: v.armor };
  }
  e.stat_healthMax = v.healthMax;
  e.stat_armor = v.armor;
  e.stat_armorMax = v.armorMax;
  e.stat_stamina = v.stamina;
  e.stat_staminaSkill = v.staminaSkill;
  e.stat_ability = v.ability;
  e.stat_lastDamageAt = v.lastDamageAt;
  if (e.health) {
    e.health.current = v.health;
    e.health.max = v.healthMax;
    e.health.armor = v.armor;
  }
}

/** First-time install via addComponent so `world.with("stat_health")` etc. pick the entity up. */
export function initVitals(e: ClientEntity, v: Vitals, opts?: { regen?: boolean }): void {
  world.addComponent(e, "stat_health", { current: v.health, max: v.healthMax, armor: v.armor });
  world.addComponent(e, "stat_healthMax", v.healthMax);
  world.addComponent(e, "stat_armor", v.armor);
  world.addComponent(e, "stat_armorMax", v.armorMax);
  world.addComponent(e, "stat_stamina", v.stamina);
  world.addComponent(e, "stat_staminaSkill", v.staminaSkill);
  world.addComponent(e, "stat_ability", v.ability);
  world.addComponent(e, "stat_lastDamageAt", v.lastDamageAt);
  if (opts?.regen) world.addComponent(e, "stat_regen", true);
  if (e.health) {
    e.health.current = v.health;
    e.health.max = v.healthMax;
    e.health.armor = v.armor;
  }
}

/** Install vitals on the player the first time it's seen (loading the active lead's baseline). */
export function ensurePlayerVitals(e: ClientEntity): boolean {
  if (hasVitals(e)) return false;
  const active = getActiveCharacter();
  const stored = getCharacter(active);
  const base: Vitals =
    stored.alive && stored.health > 0
      ? { ...stored, lastDamageAt: 0 }
      : freshVitals({
          staminaSkill: stored.staminaSkill,
          healthMax: stored.healthMax,
          armorMax: stored.armorMax,
        });
  initVitals(e, base, { regen: true });
  setCharacter(active, base);
  if (e.character === undefined) world.addComponent(e, "character", active);
  return true;
}

/** Snapshot the live player's vitals into the active character's persisted record. */
export function snapshotActivePlayer(): void {
  const p = getPlayer();
  if (!p || !hasVitals(p)) return;
  setCharacter(getActiveCharacter(), readVitals(p));
}

/** Switch controlled lead: stash the outgoing vitals, load the incoming ones onto the player. */
export function switchActiveCharacter(next: CharacterId): void {
  const prev = getActiveCharacter();
  if (next === prev) return;
  const p = getPlayer();
  if (p && hasVitals(p)) setCharacter(prev, readVitals(p));
  setActiveCharacter(next);
  if (p && hasVitals(p)) {
    writeVitals(p, getCharacter(next));
    if (p.character !== undefined) p.character = next;
  }
}

/** World-space player position (transform first, then the physics body, then origin). */
export function getPlayerPosition(e: ClientEntity): Vec3 {
  const t = e.transform?.position;
  if (t) return { x: t.x, y: t.y, z: t.z };
  const b = e.rigidBody?.translation();
  if (b) return { x: b.x, y: b.y, z: b.z };
  return { x: 0, y: 0, z: 0 };
}

/** Teleport the (kinematic) player body + transform. The controller resumes from the new spot. */
export function teleportPlayer(e: ClientEntity, dest: Vec3): void {
  const body = e.rigidBody;
  if (body) body.setTranslation({ x: dest.x, y: dest.y, z: dest.z }, true);
  if (e.transform) {
    e.transform.position.x = dest.x;
    e.transform.position.y = dest.y;
    e.transform.position.z = dest.z;
  }
}

export function markDead(e: ClientEntity): void {
  if (!e.stat_dead) world.addComponent(e, "stat_dead", true);
  if (!e.isDead) world.addComponent(e, "isDead", true);
}

export function markBusted(e: ClientEntity): void {
  if (!e.stat_busted) world.addComponent(e, "stat_busted", true);
}

/** Clear all death/busted markers (on respawn). */
export function clearDead(e: ClientEntity): void {
  if (e.stat_dead) world.removeComponent(e, "stat_dead");
  if (e.isDead) world.removeComponent(e, "isDead");
  if (e.stat_busted) world.removeComponent(e, "stat_busted");
}
