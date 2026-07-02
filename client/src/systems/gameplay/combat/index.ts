// gameplay/combat — weapons, hitscan + projectiles, damage model, shared damage/death events.
// Self-registers on import (the systems-loader eagerly imports this root index). Implements
// gta6-build/03-gameplay/combat-weapons.md under the Wave-2 protocol.
//
// Flow: read aim/fire/reload from the shared input snapshot → resolve the equipped weapon from
// inventory (`inv_equipped` / store) → gate by fire-rate + ammo + reload FSM → hitscan (Rapier +
// analytic capsule vs `stat_health` actors) or projectile → decrement the target's `stat_health`
// → emit the shared `damage`/`death` events that ragdoll + vfx + wanted consume.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

// Register ECS augmentations (own `combat_*` + the consumed `stat_health` seam) before systems.
import "./components";
import "./contracts";

import { fireSystem } from "./systems/fireSystem";
import { projectileSystem } from "./systems/projectileSystem";
import { targetSystem } from "./systems/targetSystem";
import { weaponPickupSystem } from "./systems/weaponPickupSystem";
import { combatHudSyncSystem } from "./systems/hudSyncSystem";

type W = typeof world;

export const combat: SubsystemModule<W> = {
  id: "gameplay/combat",
  systems: [fireSystem, projectileSystem, targetSystem, weaponPickupSystem, combatHudSyncSystem],
};

registerModule(combat); // required side effect — makes combat live

// ── Public API (consumers + integrator) ─────────────────────────────────────────────────────────
/** The shared combat event bus. `combatEvents.on("damage" | "death", cb)`. */
export { combatEvents, onCombatDamage, onCombatDeath } from "./events";
export type {
  CombatDamageEvent,
  CombatDeathEvent,
  CombatEventMap,
  CombatVictimKind,
  Hitzone,
} from "./types";
/** Ballistics table (data-driven weapon feel), keyed by inventory weapon ids. */
export { COMBAT_WEAPONS, getCombatWeapon, fireIntervalMs } from "./weapons";
export type {
  WeaponBallistics,
  WeaponSfxKind,
  RecoilSpec,
  TracerSpec,
  MuzzleSpec,
  DamageFalloff,
} from "./weapons";

// ── WEAPON CATALOG (ids + display names + price + ammo + full stats) ──────────────────────────
// The single sheet a gun store / pickup author reads. Fuses inventory identity + combat
// ballistics + combat-owned prices, and maps the economy storefront ids (`wpn_pistol` …).
export {
  COMBAT_CATALOG,
  combatCatalogList,
  purchasableWeapons,
  getCombatCatalogEntry,
  weaponPrice,
  ammoBoxFor,
  weaponIdForShopItem,
  SHOP_ITEM_TO_WEAPON,
} from "./catalog";
export type { CombatCatalogEntry, AmmoBox, WeaponTier } from "./catalog";

// ── ACQUISITION API — INTEGRATOR: call these from gun stores, pickups, and rewards ─────────────
// `giveWeapon(id)` / `addAmmo(...)` grant into inventory (the ammo/mag authority); validated
// against the catalog. `giveWeaponFromShopItem("wpn_pistol")` bridges the economy id namespace.
export {
  giveWeapon,
  giveWeaponFromShopItem,
  addAmmo,
  giveAmmoForWeapon,
  giveAmmoBox,
  hasWeapon,
  equipWeapon,
} from "./integrations/acquisition";
export type { GiveWeaponOptions } from "./integrations/acquisition";

// ── ENEMY (NPC) FIRE — armed peds + on-foot police shoot the player through the SAME damage path.
export { enemyFireAt, enemyMelee } from "./integrations/enemy";
export type { EnemyFireResult } from "./integrations/enemy";
/** Analytic hit helpers (reused by NPC AI for target selection / LOS if needed). */
export { castCombatRay, forEachDamageableNear } from "./hitscan";
/** Direct damage application (used by NPC melee/fire wrappers). */
export { applyHit } from "./resolve";

// ── WORLD WEAPON PICKUPS — INTEGRATOR: place these anywhere in the world ───────────────────────
export { spawnWeaponPickup } from "./systems/weaponPickupSystem";
export type { SpawnPickupOptions } from "./systems/weaponPickupSystem";
export type { CombatWeaponPickup } from "./types";

/** INTEGRATOR: mount this once inside <PhysicsProvider> to enable world occlusion + VFX + range +
 *  pickups. It self-mounts <CombatOverlay/> (crosshair/hitmarker/damage numbers) unless hud=false. */
export { CombatRig } from "./view/CombatRig";
/** INTEGRATOR (optional): mount the combat HUD yourself as a DOM sibling of <Canvas> (hud={false} on
 *  <CombatRig/>). Duplicates are safe — only one instance ever animates. */
export { CombatOverlay } from "./view/CombatOverlay";
