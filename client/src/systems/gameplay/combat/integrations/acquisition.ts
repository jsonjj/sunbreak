// Weapon ACQUISITION API — the one surface the integrator calls from gun stores, world pickups,
// mission rewards, or debug tools to actually give the player a usable weapon / ammo. It is a
// thin, validated wrapper over inventory's grant path (`pickupWeapon` / `addAmmo` / `equip`), so
// inventory stays the single source of truth for the magazine + reserve pools. Combat just
// validates ids against its catalog and resolves ammo types for you.
//
// This IS the "giveWeapon(id) / addAmmo" the brief asks for. The existing inventory path
// (`inventoryApi.pickupWeapon`) still works directly; this adds catalog validation + convenience.

import { inventoryApi, useInventoryStore } from "@/systems/gameplay/inventory";
import type { AmmoType } from "@/systems/gameplay/inventory";
import { ammoBoxFor, getCombatCatalogEntry, weaponIdForShopItem } from "../catalog";

export interface GiveWeaponOptions {
  /** Reserve ammo to grant with it. Omit to use the weapon's `startingReserve`. */
  ammo?: number;
  /** Equip it immediately. */
  equip?: boolean;
}

/**
 * Grant a weapon (by inventory id) to the player, plus starter reserve ammo. Returns false for
 * an unknown id. Safe to call repeatedly — inventory only adds a duplicate's ammo, not the gun.
 */
export function giveWeapon(id: string, opts: GiveWeaponOptions = {}): boolean {
  if (!getCombatCatalogEntry(id)) return false;
  inventoryApi.pickupWeapon(id, opts.ammo);
  if (opts.equip) inventoryApi.equip(id);
  return true;
}

/** Grant a weapon by its ECONOMY storefront item id (`wpn_pistol` …). */
export function giveWeaponFromShopItem(shopItemId: string, opts: GiveWeaponOptions = {}): boolean {
  const id = weaponIdForShopItem(shopItemId);
  return id ? giveWeapon(id, opts) : false;
}

/** True if the player already owns this weapon id. */
export function hasWeapon(id: string): boolean {
  return !!useInventoryStore.getState().ownedWeapons[id];
}

/** Equip an owned weapon by id (no-op if not owned). Returns false if the id is unknown. */
export function equipWeapon(id: string): boolean {
  if (!getCombatCatalogEntry(id)) return false;
  inventoryApi.equip(id);
  return true;
}

/** Add `n` rounds to a reserve pool directly. */
export function addAmmo(ammoType: AmmoType, n: number): void {
  inventoryApi.addAmmo(ammoType, n);
}

/**
 * Add reserve ammo for a specific WEAPON (resolves its pool for you). `rounds` defaults to one
 * resupply box for that pool. Returns false for melee / unknown ids (nothing to give).
 */
export function giveAmmoForWeapon(id: string, rounds?: number): boolean {
  const entry = getCombatCatalogEntry(id);
  if (!entry || !entry.ammoType) return false;
  const n = rounds ?? entry.ammoBox?.rounds ?? entry.startingReserve;
  if (n <= 0) return false;
  inventoryApi.addAmmo(entry.ammoType, n);
  return true;
}

/** Grant exactly one resupply box for a weapon's ammo pool (rewards / free pickups). */
export function giveAmmoBox(id: string): boolean {
  const box = ammoBoxFor(id);
  const entry = getCombatCatalogEntry(id);
  if (!box || !entry?.ammoType) return false;
  inventoryApi.addAmmo(entry.ammoType, box.rounds);
  return true;
}
