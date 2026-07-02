// Consumable catalog — health/armor items used from the wheel/quick-heal.

import type { ConsumableDef } from "../types";

export const CONSUMABLE_LIST: ConsumableDef[] = [
  {
    id: "snack_health",
    name: "Energy Snack",
    kind: "health",
    amount: 25,
    cooldownMs: 1500,
    stackMax: 10,
    icon: "health",
  },
  {
    id: "medkit",
    name: "Medkit",
    kind: "health",
    amount: 100,
    cooldownMs: 8000,
    stackMax: 3,
    icon: "medkit",
  },
  {
    id: "body_armor",
    name: "Body Armor",
    kind: "armor",
    amount: 50,
    cooldownMs: 6000,
    stackMax: 3,
    icon: "armor",
  },
];

export const CONSUMABLES: Record<string, ConsumableDef> = Object.fromEntries(
  CONSUMABLE_LIST.map((c) => [c.id, c]),
);

export function getConsumable(id: string): ConsumableDef | undefined {
  return CONSUMABLES[id];
}
