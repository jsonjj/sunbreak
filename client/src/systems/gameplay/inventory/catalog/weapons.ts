// Static weapon catalog. `WHEEL_CATEGORIES` defines the slot order (index === wheel slot),
// so every weapon's `slot` is derived from its category and can never drift out of sync.

import type { AmmoType, WeaponCategory, WeaponDef } from "../types";

/** Wheel slot order, clockwise from the top (slot 0). */
export const WHEEL_CATEGORIES = [
  "handgun",
  "smg",
  "shotgun",
  "rifle",
  "sniper",
  "heavy",
  "thrown",
  "melee",
] as const satisfies readonly WeaponCategory[];

const AMMO_BY_CATEGORY: Record<WeaponCategory, AmmoType | null> = {
  melee: null,
  handgun: "pistol",
  smg: "smg",
  shotgun: "shotgun",
  rifle: "rifle",
  sniper: "sniper",
  heavy: "rocket",
  thrown: "thrown",
};

/** Warm "Verano" accent ramp — used with restraint on the wheel. */
const ACCENTS: Record<WeaponCategory, string> = {
  handgun: "#ff9d5c",
  smg: "#ff8a63",
  shotgun: "#ff6f7d",
  rifle: "#ff5b7a",
  sniper: "#c98bff",
  heavy: "#ff7043",
  thrown: "#7fd4ff",
  melee: "#8ea0b5",
};

export function slotForCategory(cat: WeaponCategory): number {
  const i = WHEEL_CATEGORIES.indexOf(cat as (typeof WHEEL_CATEGORIES)[number]);
  return i < 0 ? 0 : i;
}

interface WeaponInit {
  id: string;
  name: string;
  category: WeaponCategory;
  magSize: number;
  icon: string;
  reserveMax?: number;
  startingReserve?: number;
}

function make(init: WeaponInit): WeaponDef {
  return {
    id: init.id,
    name: init.name,
    category: init.category,
    ammoType: AMMO_BY_CATEGORY[init.category],
    magSize: init.magSize,
    slot: slotForCategory(init.category),
    icon: init.icon,
    reserveMax: init.reserveMax ?? 300,
    startingReserve: init.startingReserve ?? 0,
    accent: ACCENTS[init.category],
  };
}

/**
 * v1 roster: one weapon per category so the wheel reads complete. Ownership (see
 * `rules.defaultSnapshot`) starts with fists + pistol; the rest exist but render dimmed until
 * picked up / bought (v2/v3).
 */
export const WEAPON_LIST: WeaponDef[] = [
  make({ id: "fists", name: "Fists", category: "melee", magSize: 0, icon: "melee" }),
  make({
    id: "pistol_9mm",
    name: "9mm Pistol",
    category: "handgun",
    magSize: 12,
    icon: "handgun",
    reserveMax: 120,
    startingReserve: 36,
  }),
  make({
    id: "smg_vector",
    name: "Compact SMG",
    category: "smg",
    magSize: 30,
    icon: "smg",
    reserveMax: 300,
    startingReserve: 90,
  }),
  make({
    id: "shotgun_pump",
    name: "Pump Shotgun",
    category: "shotgun",
    magSize: 8,
    icon: "shotgun",
    reserveMax: 64,
    startingReserve: 24,
  }),
  make({
    id: "rifle_carbine",
    name: "Carbine Rifle",
    category: "rifle",
    magSize: 30,
    icon: "rifle",
    reserveMax: 300,
    startingReserve: 90,
  }),
  make({
    id: "sniper_bolt",
    name: "Bolt Sniper",
    category: "sniper",
    magSize: 5,
    icon: "sniper",
    reserveMax: 40,
    startingReserve: 15,
  }),
  make({
    id: "launcher_rpg",
    name: "RPG",
    category: "heavy",
    magSize: 1,
    icon: "heavy",
    reserveMax: 8,
    startingReserve: 2,
  }),
  make({
    id: "grenade",
    name: "Grenade",
    category: "thrown",
    magSize: 1,
    icon: "thrown",
    reserveMax: 25,
    startingReserve: 5,
  }),
];

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(
  WEAPON_LIST.map((w) => [w.id, w]),
);

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}

/** Well-known ids other subsystems may reference. */
export const FISTS_ID = "fists";
export const PISTOL_ID = "pistol_9mm";
