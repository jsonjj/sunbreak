// Lightweight event bus for cross-subsystem hooks (audio dry-fire, animation, stats). Combat &
// audio can `inventoryEvents.on("ammoEmpty", …)` without importing the store.

import mitt from "mitt";
import type { ConsumableKind } from "./types";

export type InventoryEventMap = {
  equip: { weaponId: string };
  holster: { weaponId: string | null };
  reload: { weaponId: string; loaded: number };
  /** Emitted when a fire is attempted with an empty magazine (dry-fire). */
  ammoEmpty: { weaponId: string };
  pickup: { weaponId: string; reserveAdded: number };
  consumable: { id: string; kind: ConsumableKind; amount: number };
};

export const inventoryEvents = mitt<InventoryEventMap>();
