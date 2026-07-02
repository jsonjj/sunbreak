// Inventory data model — the single source of truth for what the player carries.
// These types would normally live in `@sunbreak/shared`, but Wave-2 ownership rules keep this
// subsystem self-contained: they are authored here and re-exported from `index.ts` so Combat,
// Economy, HUD, etc. can import the same contracts.

/** Reserve-ammo pools. `null` on a weapon means melee (no ammo). */
export type AmmoType = "pistol" | "smg" | "shotgun" | "rifle" | "sniper" | "rocket" | "thrown";

/** The eight weapon-wheel categories (one wheel segment each, slots 0..7). */
export type WeaponCategory =
  | "melee"
  | "handgun"
  | "smg"
  | "shotgun"
  | "rifle"
  | "sniper"
  | "heavy"
  | "thrown";

/** Static, module-level weapon definition. Combat co-reads this for ballistic lookups. */
export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  /** `null` = melee (no reserve pool, always "can fire"). */
  ammoType: AmmoType | null;
  /** Rounds per magazine (0 for melee/thrown-as-single). */
  magSize: number;
  /** Wheel segment 0..7 (mirrors the category order). */
  slot: number;
  /** Icon key resolved by the wheel/HUD (see `catalog/icons.tsx`). */
  icon: string;
  /** Hard cap on the reserve pool this weapon draws from. */
  reserveMax: number;
  /** Reserve granted the first time the weapon is owned/picked up. */
  startingReserve: number;
  /** Optional accent color for the wheel segment. */
  accent?: string;
}

/** A concrete weapon the player owns (its live magazine + any attachments). */
export interface WeaponInstance {
  defId: string;
  mag: number;
  attachments?: string[];
}

export type ConsumableKind = "health" | "armor";

/** Static definition for a usable consumable (snack, medkit, armor). */
export interface ConsumableDef {
  id: string;
  name: string;
  kind: ConsumableKind;
  /** How much health/armor a single use restores. */
  amount: number;
  /** Per-item use cooldown in milliseconds. */
  cooldownMs: number;
  stackMax: number;
  icon: string;
}

/** Every reserve pool, keyed by ammo type. */
export type AmmoPools = Record<AmmoType, number>;

/** The serializable, persisted view of the player's loadout. */
export interface InventorySnapshot {
  ownedWeapons: Record<string, WeaponInstance>;
  ammo: AmmoPools;
  consumables: Record<string, number>;
  equippedWeaponId: string | null;
  lastByCategory: Partial<Record<WeaponCategory, string>>;
  cash: number;
  version: number;
}
