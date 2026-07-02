// Imperative facade for non-React consumers (Combat, Economy, World/Pickups). Combat reads the
// `inv_equipped` ECS component for what's in hand, then calls `canFire()` / `consumeAmmo()` on
// each shot and `reload()` on reload. Everything routes through the one store instance.

import type { AmmoType, InventorySnapshot } from "./types";
import type { InvEquipped } from "./components";
import { buildInvEquipped } from "./components";
import { useInventoryStore } from "./store";
import { inventoryEvents } from "./events";

const state = () => useInventoryStore.getState();

export const inventoryApi = {
  // Firing gate (Combat calls these on each shot).
  canFire: (): boolean => state().canFire(),
  consumeAmmo: (n = 1): boolean => state().consumeAmmo(n),
  reload: (): void => state().reload(),

  // Equip / switching.
  equip: (id: string): void => state().equip(id),
  holster: (): void => state().holster(),
  cycle: (dir: 1 | -1): void => state().cycle(dir),

  // Pickups / economy / items.
  addAmmo: (type: AmmoType, n: number): void => state().addAmmo(type, n),
  pickupWeapon: (id: string, reserve?: number): void => state().pickupWeapon(id, reserve),
  useConsumable: (id: string): boolean => state().useConsumable(id),
  addCash: (n: number): void => state().addCash(n),

  // Read models.
  getEquipped: (): InvEquipped | null => {
    const s = state();
    const def = s.equippedDef();
    const inst = s.equippedInstance();
    return buildInvEquipped(def, inst, def ? s.reserveOf(def.ammoType) : 0);
  },
  getSnapshot: (): InventorySnapshot => state().toSnapshot(),
} as const;

export type InventoryApi = typeof inventoryApi;

export { inventoryEvents };
