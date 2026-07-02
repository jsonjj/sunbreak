// Inventory seam — the ONE place combat touches `gameplay/inventory`. Combat READS the equipped
// weapon (per the brief) from the ECS `inv_equipped` read-model when present, and otherwise from
// the inventory store directly (reliable today, since the store ships a default loadout even
// before inventory's ECS mirror system is registered). Ammo spend / reload go through the store's
// documented "Combat contract" (`consumeAmmo` / `reload` / `canFire`) so inventory stays the
// single source of truth for the magazine + reserve pools. If inventory refactors, only this file
// changes.

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useInventoryStore } from "@/systems/gameplay/inventory/store";
import type { EquippedView } from "../types";

/** Structural view of inventory's `inv_equipped` component (read defensively, no hard type dep). */
interface InvEquippedLike {
  weaponId: string;
  name: string;
  isMelee: boolean;
  ammoType: string | null;
  mag: number;
  magSize: number;
  reserve: number;
  canFire: boolean;
}

/** Resolve the currently equipped weapon: `inv_equipped` first, else the inventory store. */
export function readEquipped(player: ClientEntity): EquippedView | null {
  const fromEcs = (player as { inv_equipped?: InvEquippedLike }).inv_equipped;
  if (fromEcs) {
    return {
      weaponId: fromEcs.weaponId,
      name: fromEcs.name,
      isMelee: fromEcs.isMelee,
      ammoType: fromEcs.ammoType,
      mag: fromEcs.mag,
      magSize: fromEcs.magSize,
      reserve: fromEcs.reserve,
      canFire: fromEcs.canFire,
    };
  }

  const s = useInventoryStore.getState();
  const def = s.equippedDef();
  const inst = s.equippedInstance();
  if (!def || !inst) return null;
  const isMelee = def.ammoType === null;
  return {
    weaponId: def.id,
    name: def.name,
    isMelee,
    ammoType: def.ammoType,
    mag: inst.mag,
    magSize: def.magSize,
    reserve: s.reserveOf(def.ammoType),
    canFire: isMelee || inst.mag > 0,
  };
}

/** Spend `n` rounds from the equipped magazine. Returns false (and inventory emits `ammoEmpty`)
 *  when the mag can't cover it. Melee always succeeds. */
export function spendRound(n = 1): boolean {
  return useInventoryStore.getState().consumeAmmo(n);
}

/** Move reserve → magazine for the equipped weapon (inventory does the bookkeeping). */
export function reloadEquipped(): void {
  useInventoryStore.getState().reload();
}

/** True if a reload is worthwhile (mag not full and reserve available; never for melee). */
export function canReload(eq: EquippedView): boolean {
  return !eq.isMelee && eq.mag < eq.magSize && eq.reserve > 0;
}

/** Set/clear the `inv_reloading` presence tag (reserved for combat by inventory's contract). */
export function setReloadingTag(player: ClientEntity, on: boolean): void {
  const has = (player as { inv_reloading?: true }).inv_reloading === true;
  if (on && !has) world.addComponent(player, "inv_reloading", true);
  else if (!on && has) world.removeComponent(player, "inv_reloading");
}
