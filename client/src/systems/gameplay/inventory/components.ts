// ECS augmentation — the Inventory↔Combat contract lives on the player entity as `inv_*`
// components. Combat READS these every frame (no store import required); Inventory writes them
// from `equippedMirrorSystem`. Fields are serializable POJOs so this is v4/server-safe.

import type { AmmoType, WeaponCategory, WeaponDef, WeaponInstance } from "./types";

/** What the player currently has in hand — the primary thing Combat reads. */
export interface InvEquipped {
  /** WeaponDef id, e.g. "pistol_9mm" or "fists". */
  weaponId: string;
  name: string;
  category: WeaponCategory;
  /** `null` = melee. */
  ammoType: AmmoType | null;
  /** Wheel slot 0..7. */
  slot: number;
  /** Rounds currently in the magazine. */
  mag: number;
  magSize: number;
  /** Reserve rounds available for this weapon's ammo type (mirrored for convenience). */
  reserve: number;
  isMelee: boolean;
  /** True when a shot/swing is allowed right now (melee, or mag > 0). Combat can trust this. */
  canFire: boolean;
}

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Equipped weapon read-model for Combat/Animation/HUD. */
    inv_equipped?: InvEquipped;
    /** Mirror of all reserve ammo pools (for HUD / combat reload UI). */
    inv_ammo?: Partial<Record<AmmoType, number>>;
    /** Presence tag set by Combat while a reload is in-flight (reserved for combat use). */
    inv_reloading?: true;
  }
}

/** Build the `inv_equipped` read-model from a def + instance + current reserve. */
export function buildInvEquipped(
  def: WeaponDef | null,
  inst: WeaponInstance | null,
  reserve: number,
): InvEquipped | null {
  if (!def || !inst) return null;
  const isMelee = def.ammoType === null;
  return {
    weaponId: def.id,
    name: def.name,
    category: def.category,
    ammoType: def.ammoType,
    slot: def.slot,
    mag: inst.mag,
    magSize: def.magSize,
    reserve,
    isMelee,
    canFire: isMelee || inst.mag > 0,
  };
}
