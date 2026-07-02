// Pure inventory rules — no React, no ECS, no side effects. Shared by the store, the wheel,
// persistence, and (later) the server for authoritative validation.

import type {
  AmmoPools,
  AmmoType,
  InventorySnapshot,
  WeaponCategory,
  WeaponDef,
  WeaponInstance,
} from "./types";
import { FISTS_ID, PISTOL_ID, WEAPONS, WEAPON_LIST, WHEEL_CATEGORIES } from "./catalog/weapons";

export const AMMO_TYPES: readonly AmmoType[] = [
  "pistol",
  "smg",
  "shotgun",
  "rifle",
  "sniper",
  "rocket",
  "thrown",
];

/** Sim time-scale while the wheel is open (slow-mo). Player/physics may read this. */
export const WHEEL_TIME_SCALE = 0.2;

/** Absolute clamp on any single reserve pool (defensive; real caps come from `reserveMax`). */
export const RESERVE_HARD_CAP = 999;

export function emptyAmmoPools(): AmmoPools {
  return { pistol: 0, smg: 0, shotgun: 0, rifle: 0, sniper: 0, rocket: 0, thrown: 0 };
}

export function slotForCategory(cat: WeaponCategory): number {
  const i = WHEEL_CATEGORIES.indexOf(cat as (typeof WHEEL_CATEGORIES)[number]);
  return i < 0 ? 0 : i;
}

export function categoryForSlot(slot: number): WeaponCategory | null {
  return WHEEL_CATEGORIES[slot] ?? null;
}

/** The starting loadout: fists + pistol owned; everything else exists but is unowned. */
export function defaultSnapshot(): InventorySnapshot {
  const ammo = emptyAmmoPools();
  ammo.pistol = 36;
  const ownedWeapons: Record<string, WeaponInstance> = {
    [FISTS_ID]: { defId: FISTS_ID, mag: 0 },
    [PISTOL_ID]: { defId: PISTOL_ID, mag: WEAPONS[PISTOL_ID]?.magSize ?? 12 },
  };
  return {
    ownedWeapons,
    ammo,
    consumables: { snack_health: 2, medkit: 1, body_armor: 1 },
    // Start UNARMED (fists) so punching works immediately (LMB throws a punch). The pistol is still
    // owned + there's a pistol pickup right in front of spawn that auto-equips — walk into it to arm.
    equippedWeaponId: FISTS_ID,
    lastByCategory: { handgun: PISTOL_ID, melee: FISTS_ID },
    cash: 500,
    version: 1,
  };
}

export function canEquip(snap: Pick<InventorySnapshot, "ownedWeapons">, id: string): boolean {
  return !!snap.ownedWeapons[id] && !!WEAPONS[id];
}

export function reserveForAmmo(snap: Pick<InventorySnapshot, "ammo">, type: AmmoType | null): number {
  if (!type) return 0;
  return snap.ammo[type] ?? 0;
}

/**
 * Carry caps. v1 = unlimited (returns Infinity for every category). Wired now so v2 can enforce
 * "2 long + 2 sidearm + melee + throwables" without touching call sites.
 */
export function carryCaps(): Record<WeaponCategory, number> {
  return {
    melee: Infinity,
    handgun: Infinity,
    smg: Infinity,
    shotgun: Infinity,
    rifle: Infinity,
    sniper: Infinity,
    heavy: Infinity,
    thrown: Infinity,
  };
}

/** Owned weapon ids, ordered by wheel slot (stable cycle order). Drops ids with no def. */
export function ownedWeaponIds(owned: Record<string, WeaponInstance>): string[] {
  return Object.keys(owned)
    .map((id) => WEAPONS[id])
    .filter((d): d is WeaponDef => d !== undefined)
    .sort((a, b) => a.slot - b.slot)
    .map((d) => d.id);
}

/** First owned weapon within a category (roster order), or null. */
export function firstOwnedInCategory(
  owned: Record<string, WeaponInstance>,
  cat: WeaponCategory,
): string | null {
  for (const d of WEAPON_LIST) {
    if (d.category === cat && owned[d.id]) return d.id;
  }
  return null;
}

/** Distinct wheel slots that contain at least one owned weapon, ascending. */
export function ownedSlots(owned: Record<string, WeaponInstance>): number[] {
  const set = new Set<number>();
  for (const id of Object.keys(owned)) {
    const d = WEAPONS[id];
    if (d) set.add(d.slot);
  }
  return [...set].sort((a, b) => a - b);
}

/** Clamp + fill a possibly-partial snapshot into a valid one (used on hydrate/persist load). */
export function sanitizeSnapshot(input: Partial<InventorySnapshot>): InventorySnapshot {
  const base = defaultSnapshot();
  const ammo: AmmoPools = { ...emptyAmmoPools(), ...(input.ammo ?? {}) };
  for (const t of AMMO_TYPES) {
    ammo[t] = clamp(Math.floor(ammo[t] ?? 0), 0, RESERVE_HARD_CAP);
  }

  const ownedWeapons: Record<string, WeaponInstance> = {};
  const src = input.ownedWeapons ?? base.ownedWeapons;
  for (const [id, inst] of Object.entries(src)) {
    const def = WEAPONS[id];
    if (!def || !inst) continue;
    ownedWeapons[id] = {
      defId: id,
      mag: clamp(Math.floor(inst.mag ?? 0), 0, def.magSize),
      ...(inst.attachments ? { attachments: [...inst.attachments] } : {}),
    };
  }
  // Fists are always available so holstering never fails.
  if (!ownedWeapons[FISTS_ID]) ownedWeapons[FISTS_ID] = { defId: FISTS_ID, mag: 0 };

  const equippedWeaponId =
    input.equippedWeaponId && ownedWeapons[input.equippedWeaponId]
      ? input.equippedWeaponId
      : (ownedWeapons[PISTOL_ID] ? PISTOL_ID : FISTS_ID);

  const lastByCategory: Partial<Record<WeaponCategory, string>> = {};
  for (const [cat, id] of Object.entries(input.lastByCategory ?? {})) {
    if (id && ownedWeapons[id]) lastByCategory[cat as WeaponCategory] = id;
  }

  const consumables: Record<string, number> = {};
  for (const [id, n] of Object.entries(input.consumables ?? base.consumables)) {
    consumables[id] = clamp(Math.floor(n ?? 0), 0, 99);
  }

  return {
    ownedWeapons,
    ammo,
    consumables,
    equippedWeaponId,
    lastByCategory,
    cash: clamp(Math.floor(input.cash ?? base.cash), 0, 1_000_000_000),
    version: input.version ?? base.version,
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
