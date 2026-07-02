// Subsystem: gameplay/inventory (client) — player loadout model, radial weapon wheel, ammo &
// consumables, and localStorage persistence. Implemented per WAVE2-PROTOCOL + the
// inventory-weaponwheel spec, adapted to live entirely inside this folder.
//
// Self-registers on import (systems-loader eager-imports this file). The integrator mounts the
// exported <WeaponWheel/> (or <InventoryOverlay/>) as a DOM sibling of <Canvas>. Combat reads
// the player's `inv_equipped` / `inv_ammo` ECS components and calls `inventoryApi`.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import { installConsumableEffects, inventorySystems } from "./systems";
import { installInputFallback, installPointerLockSync } from "./input";
import { hydrateFromStorage, installPersistence } from "./persistence";

type W = typeof world;

/** One-time boot: hydrate from disk, then wire persistence, local input, pointer-lock, effects. */
function boot(): () => void {
  const disposers: Array<() => void> = [];
  hydrateFromStorage();
  disposers.push(installPersistence());
  disposers.push(installInputFallback());
  disposers.push(installPointerLockSync());
  disposers.push(installConsumableEffects());
  return () => {
    for (const d of disposers) d();
  };
}

export const mod: SubsystemModule<W> = {
  id: "gameplay/inventory",
  systems: inventorySystems,
  init: boot,
};

let dispose: (() => void) | null = registerModule(mod);

// Clean HMR: unregister systems + tear down listeners before the module re-evaluates.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dispose?.();
    dispose = null;
  });
}

// ── Public API (consumed by the integrator + sibling subsystems) ──────────────────────────────
export { mod as inventoryModule };

// State + imperative facade.
export { useInventoryStore } from "./store";
export type { InventoryState } from "./store";
export { inventoryApi, inventoryEvents } from "./api";
export type { InventoryApi } from "./api";
export type { InventoryEventMap } from "./events";

// React overlays (mount as DOM siblings of <Canvas>).
export { WeaponWheel } from "./ui/WeaponWheel";
export { AmmoCounter } from "./ui/AmmoCounter";
export { InventoryOverlay } from "./ui/InventoryOverlay";
export { WeaponGlyph, WeaponIcon } from "./catalog/icons";

// ECS contract (Combat reads these).
export type { InvEquipped } from "./components";
export { buildInvEquipped } from "./components";

// Catalogs + rules (co-read by Combat/Economy/HUD).
export {
  WEAPONS,
  WEAPON_LIST,
  WHEEL_CATEGORIES,
  getWeapon,
  FISTS_ID,
  PISTOL_ID,
} from "./catalog/weapons";
export { CONSUMABLES, CONSUMABLE_LIST, getConsumable } from "./catalog/items";
export * as inventoryRules from "./rules";

// Config + persistence helpers.
export { inputConfig } from "./input";
export { loadInventory } from "./persistence";

// Shared data contracts.
export type {
  AmmoType,
  AmmoPools,
  WeaponCategory,
  WeaponDef,
  WeaponInstance,
  ConsumableDef,
  ConsumableKind,
  InventorySnapshot,
} from "./types";
