// The unified WEAPON CATALOG — the single sheet a gun store or world-pickup author reads to know
// "what can I sell / drop, for how much, and what ammo does it use". It fuses the three sources
// of truth WITHOUT duplicating them:
//   • inventory  → identity  (display name, category, magSize, ammoType, reserve caps)
//   • combat     → ballistics (damage / rpm / range / spread / recoil / …) + PRICES (owned here)
//   • economy    → storefront ids (`wpn_pistol` …) mapped to the real inventory ids
//
// Iterating `combatCatalogList()` always reflects inventory's roster, so this can never drift.

import { WEAPON_LIST } from "@/systems/gameplay/inventory";
import type { AmmoType, WeaponCategory } from "@/systems/gameplay/inventory";
import { COMBAT_WEAPONS, getCombatWeapon, type WeaponBallistics } from "./weapons";

export type WeaponTier = 1 | 2 | 3 | 4 | 5;

/** One box of resupply ammo a store can sell for this weapon's pool. */
export interface AmmoBox {
  price: number;
  rounds: number;
}

/** Everything a shop / pickup needs about one weapon. */
export interface CombatCatalogEntry {
  id: string;
  name: string;
  category: WeaponCategory;
  ammoType: AmmoType | null;
  magSize: number;
  reserveMax: number;
  startingReserve: number;
  /** Clean-cash price for gun stores; 0 = not for sale (e.g. fists). */
  price: number;
  /** One resupply box for this weapon's ammo pool (null for melee). */
  ammoBox: AmmoBox | null;
  tier: WeaponTier;
  blurb: string;
  ballistics: WeaponBallistics;
  /** The economy storefront item id that grants this weapon, if one exists. */
  shopItemId?: string;
}

/** Combat-owned price sheet (clean cash). Aligned with the economy weapon tiers where they overlap. */
const PRICE: Record<string, number> = {
  fists: 0,
  pistol_9mm: 900,
  smg_vector: 3200,
  shotgun_pump: 4800,
  rifle_carbine: 9500,
  sniper_bolt: 22000,
  launcher_rpg: 45000,
  grenade: 800,
};

const TIER: Record<string, WeaponTier> = {
  fists: 1,
  pistol_9mm: 1,
  smg_vector: 2,
  shotgun_pump: 3,
  rifle_carbine: 4,
  sniper_bolt: 5,
  launcher_rpg: 5,
  grenade: 2,
};

const BLURB: Record<string, string> = {
  fists: "Always in stock.",
  pistol_9mm: "Everyday sidearm — quick, accurate, forgiving.",
  smg_vector: "Spray the boulevard; low recoil, high cadence.",
  shotgun_pump: "Close-range authority. Nine pellets of persuasion.",
  rifle_carbine: "The all-rounder — controllable full-auto at range.",
  sniper_bolt: "One breath, one shot. Torso-lethal.",
  launcher_rpg: "Big problems, bigger solutions.",
  grenade: "Cook it, arc it, clear the room.",
};

/** Resupply box per AMMO POOL (a weapon inherits its pool's box). */
const AMMO_BOX: Record<AmmoType, AmmoBox> = {
  pistol: { price: 40, rounds: 24 },
  smg: { price: 80, rounds: 60 },
  shotgun: { price: 120, rounds: 16 },
  rifle: { price: 150, rounds: 60 },
  sniper: { price: 300, rounds: 10 },
  rocket: { price: 1200, rounds: 1 },
  thrown: { price: 250, rounds: 3 },
};

/** Economy storefront item id → inventory weapon id (bridges the two id namespaces). */
export const SHOP_ITEM_TO_WEAPON: Record<string, string> = {
  wpn_bat: "fists", // economy's melee tier — no distinct bat id in inventory yet
  wpn_pistol: "pistol_9mm",
  wpn_smg: "smg_vector",
  wpn_shotgun: "shotgun_pump",
  wpn_rifle: "rifle_carbine",
  wpn_marksman: "sniper_bolt",
};

const WEAPON_TO_SHOP_ITEM: Record<string, string> = Object.fromEntries(
  Object.entries(SHOP_ITEM_TO_WEAPON).map(([shop, wpn]): [string, string] => [wpn, shop]),
);

function buildEntry(id: string): CombatCatalogEntry {
  const def = WEAPON_LIST.find((w) => w.id === id);
  const ballistics = getCombatWeapon(id);
  const ammoType = def?.ammoType ?? null;
  const shopItemId = WEAPON_TO_SHOP_ITEM[id];
  return {
    id,
    name: def?.name ?? id,
    category: (def?.category ?? "handgun") as WeaponCategory,
    ammoType,
    magSize: def?.magSize ?? 0,
    reserveMax: def?.reserveMax ?? 0,
    startingReserve: def?.startingReserve ?? 0,
    price: PRICE[id] ?? 0,
    ammoBox: ammoType ? AMMO_BOX[ammoType] : null,
    tier: TIER[id] ?? 1,
    blurb: BLURB[id] ?? "",
    ballistics,
    ...(shopItemId ? { shopItemId } : {}),
  };
}

/** The catalog, keyed by inventory weapon id. Built from inventory's roster (never drifts). */
export const COMBAT_CATALOG: Record<string, CombatCatalogEntry> = Object.fromEntries(
  WEAPON_LIST.map((w): [string, CombatCatalogEntry] => [w.id, buildEntry(w.id)]),
);

// Ensure any combat ballistics id missing from inventory's roster still surfaces (defensive).
for (const id of Object.keys(COMBAT_WEAPONS)) {
  if (!COMBAT_CATALOG[id]) COMBAT_CATALOG[id] = buildEntry(id);
}

/** All catalog entries, ordered cheapest-first (fists/free last). */
export function combatCatalogList(): CombatCatalogEntry[] {
  return Object.values(COMBAT_CATALOG).sort((a, b) => a.tier - b.tier || a.price - b.price);
}

/** Sellable weapons only (price > 0), cheapest-first — the exact list a gun store renders. */
export function purchasableWeapons(): CombatCatalogEntry[] {
  return combatCatalogList().filter((w) => w.price > 0);
}

export function getCombatCatalogEntry(id: string): CombatCatalogEntry | undefined {
  return COMBAT_CATALOG[id];
}

/** Clean-cash price for a weapon id (0 if unknown / not for sale). */
export function weaponPrice(id: string): number {
  return COMBAT_CATALOG[id]?.price ?? 0;
}

/** Resupply box (price + rounds) for a weapon's ammo pool, or null for melee/unknown. */
export function ammoBoxFor(id: string): AmmoBox | null {
  return COMBAT_CATALOG[id]?.ammoBox ?? null;
}

/** Resolve an economy storefront item id (`wpn_pistol`) to the inventory weapon id. */
export function weaponIdForShopItem(shopItemId: string): string | undefined {
  return SHOP_ITEM_TO_WEAPON[shopItemId];
}
