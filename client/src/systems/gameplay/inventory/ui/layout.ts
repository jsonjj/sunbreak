// Wheel layout model — turns the store's owned-weapon map into an ordered list of segments the
// wheel renders (ONE segment per OWNED weapon, never the empty category slots). Shared by the
// renderer, the labels, and the pointer hit-test so they always agree on order + count.

import type { AmmoPools, WeaponDef, WeaponInstance } from "../types";
import { WEAPONS } from "../catalog/weapons";
import { ownedWeaponIds } from "../rules";

/** One owned weapon, resolved into everything a wheel segment needs to render + equip. */
export interface WheelEntry {
  /** Weapon def id — pass to `useInventoryStore.getState().equip(id)`. */
  id: string;
  def: WeaponDef;
  inst: WeaponInstance;
  /** Category wheel slot 0..7 (the store's `hoverSlot` space; drives release-commit + scroll). */
  slot: number;
  /** Rounds in the magazine right now. */
  mag: number;
  /** Reserve rounds for this weapon's ammo type (0 for melee). */
  reserve: number;
  isMelee: boolean;
  /** Restrained accent used for hover/equipped emphasis. */
  accent: string;
}

const DEFAULT_ACCENT = "#ff9d5c";

/**
 * Build the ordered owned-weapon segments. Order follows `ownedWeaponIds` (ascending wheel slot),
 * which is stable and matches the scroll-cycle order, so hovering, scrolling, and number keys all
 * move through the same sequence. Unknown ids are dropped by `ownedWeaponIds`.
 */
export function ownedWheelEntries(
  owned: Record<string, WeaponInstance>,
  ammo: AmmoPools,
): WheelEntry[] {
  const entries: WheelEntry[] = [];
  for (const id of ownedWeaponIds(owned)) {
    const def = WEAPONS[id];
    const inst = owned[id];
    if (!def || !inst) continue;
    const isMelee = def.ammoType === null;
    entries.push({
      id,
      def,
      inst,
      slot: def.slot,
      mag: inst.mag,
      reserve: def.ammoType ? (ammo[def.ammoType] ?? 0) : 0,
      isMelee,
      accent: def.accent ?? DEFAULT_ACCENT,
    });
  }
  return entries;
}
