// The inventory store — single source of truth for the player's loadout. Zustand v5 (curried
// create + subscribeWithSelector) so both the R3F systems and the DOM wheel overlay read/write
// the same instance. Firing/ammo mutations are plain `set` calls (never React state on the hot
// path); the equipped read-model is mirrored onto ECS `inv_*` components by a system.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  AmmoType,
  InventorySnapshot,
  WeaponCategory,
  WeaponDef,
  WeaponInstance,
} from "./types";
import { FISTS_ID, PISTOL_ID, WEAPONS } from "./catalog/weapons";
import { CONSUMABLES } from "./catalog/items";
import {
  RESERVE_HARD_CAP,
  WHEEL_TIME_SCALE,
  categoryForSlot,
  clamp,
  defaultSnapshot,
  firstOwnedInCategory,
  ownedSlots,
  ownedWeaponIds,
  sanitizeSnapshot,
} from "./rules";
import { inventoryEvents } from "./events";

export interface InventoryState extends InventorySnapshot {
  // --- transient (never persisted) ---
  wheelOpen: boolean;
  /** -1 = nothing hovered, else 0..7. */
  hoverSlot: number;
  /** Sim time-scale; 1 normally, WHEEL_TIME_SCALE while the wheel is open. */
  timeScale: number;
  /** consumable id -> epoch ms when it becomes usable again. */
  cooldowns: Record<string, number>;

  // --- derived getters ---
  equippedDef: () => WeaponDef | null;
  equippedInstance: () => WeaponInstance | null;
  reserveOf: (type: AmmoType | null) => number;

  // --- wheel ---
  openWheel: () => void;
  closeWheel: () => void;
  toggleWheel: () => void;
  setHover: (slot: number) => void;
  cycleHover: (dir: 1 | -1) => void;

  // --- equip / switch ---
  equip: (id: string) => void;
  holster: () => void;
  cycle: (dir: 1 | -1) => void;
  selectCategory: (cat: WeaponCategory) => void;
  quickEquipSlot: (slot: number) => void;

  // --- ammo / firing (Combat contract) ---
  canFire: () => boolean;
  consumeAmmo: (n?: number) => boolean;
  reload: () => void;
  addAmmo: (type: AmmoType, n: number) => void;

  // --- items / economy ---
  pickupWeapon: (id: string, reserve?: number) => void;
  useConsumable: (id: string) => boolean;
  bestHealItem: () => string | null;
  addCash: (n: number) => void;

  // --- persistence ---
  hydrate: (snap: Partial<InventorySnapshot>) => void;
  toSnapshot: () => InventorySnapshot;
}

/** Immutable magazine patch for one owned weapon. */
function withMag(
  owned: Record<string, WeaponInstance>,
  defId: string,
  mag: number,
): Record<string, WeaponInstance> {
  const inst = owned[defId];
  if (!inst) return owned;
  return { ...owned, [defId]: { ...inst, mag } };
}

export const useInventoryStore = create<InventoryState>()(
  subscribeWithSelector((set, get) => ({
    ...defaultSnapshot(),
    wheelOpen: false,
    hoverSlot: -1,
    timeScale: 1,
    cooldowns: {},

    equippedDef: () => {
      const id = get().equippedWeaponId;
      return id ? (WEAPONS[id] ?? null) : null;
    },
    equippedInstance: () => {
      const id = get().equippedWeaponId;
      return id ? (get().ownedWeapons[id] ?? null) : null;
    },
    reserveOf: (type) => (type ? (get().ammo[type] ?? 0) : 0),

    openWheel: () => {
      if (get().wheelOpen) return;
      const slot = get().equippedDef()?.slot ?? -1;
      set({ wheelOpen: true, hoverSlot: slot, timeScale: WHEEL_TIME_SCALE });
    },
    closeWheel: () => {
      if (!get().wheelOpen) return;
      const slot = get().hoverSlot;
      if (slot >= 0) {
        const cat = categoryForSlot(slot);
        if (cat) {
          const id = get().lastByCategory[cat] ?? firstOwnedInCategory(get().ownedWeapons, cat);
          if (id) get().equip(id);
        }
      }
      set({ wheelOpen: false, hoverSlot: -1, timeScale: 1 });
    },
    toggleWheel: () => (get().wheelOpen ? get().closeWheel() : get().openWheel()),
    setHover: (slot) => set({ hoverSlot: slot }),
    cycleHover: (dir) => {
      const slots = ownedSlots(get().ownedWeapons);
      if (slots.length === 0) return;
      const cur = get().hoverSlot >= 0 ? get().hoverSlot : (get().equippedDef()?.slot ?? -1);
      let idx = slots.indexOf(cur);
      if (idx < 0) {
        const first = slots[0];
        if (first !== undefined) set({ hoverSlot: first });
        return;
      }
      idx = (idx + dir + slots.length) % slots.length;
      const next = slots[idx];
      if (next !== undefined) set({ hoverSlot: next });
    },

    equip: (id) => {
      const def = WEAPONS[id];
      if (!def || !get().ownedWeapons[id]) return;
      if (get().equippedWeaponId === id) return;
      set((s) => ({
        equippedWeaponId: id,
        lastByCategory: { ...s.lastByCategory, [def.category]: id },
      }));
      inventoryEvents.emit("equip", { weaponId: id });
    },
    holster: () => {
      if (get().ownedWeapons[FISTS_ID]) get().equip(FISTS_ID);
      else set({ equippedWeaponId: null });
      inventoryEvents.emit("holster", { weaponId: get().equippedWeaponId });
    },
    cycle: (dir) => {
      const ids = ownedWeaponIds(get().ownedWeapons);
      if (ids.length === 0) return;
      const cur = get().equippedWeaponId;
      let i = cur ? ids.indexOf(cur) : -1;
      if (i < 0) i = dir > 0 ? -1 : 0;
      i = (i + dir + ids.length) % ids.length;
      const next = ids[i];
      if (next) get().equip(next);
    },
    selectCategory: (cat) => {
      const id = get().lastByCategory[cat] ?? firstOwnedInCategory(get().ownedWeapons, cat);
      if (id) get().equip(id);
    },
    quickEquipSlot: (slot) => {
      const cat = categoryForSlot(slot);
      if (cat) get().selectCategory(cat);
    },

    canFire: () => {
      const def = get().equippedDef();
      const inst = get().equippedInstance();
      if (!def || !inst) return false;
      return def.ammoType === null || inst.mag > 0;
    },
    consumeAmmo: (n = 1) => {
      const def = get().equippedDef();
      const inst = get().equippedInstance();
      if (!def || !inst) return false;
      if (def.ammoType === null) return true; // melee: nothing to consume
      if (inst.mag < n) {
        inventoryEvents.emit("ammoEmpty", { weaponId: def.id });
        return false;
      }
      set((s) => ({ ownedWeapons: withMag(s.ownedWeapons, inst.defId, inst.mag - n) }));
      return true;
    },
    reload: () => {
      const def = get().equippedDef();
      const inst = get().equippedInstance();
      if (!def || !inst || def.ammoType === null) return;
      const ammoType = def.ammoType;
      const need = def.magSize - inst.mag;
      if (need <= 0) return;
      const avail = get().ammo[ammoType] ?? 0;
      const take = Math.min(need, avail);
      if (take <= 0) return;
      set((s) => ({
        ownedWeapons: withMag(s.ownedWeapons, inst.defId, inst.mag + take),
        ammo: { ...s.ammo, [ammoType]: (s.ammo[ammoType] ?? 0) - take },
      }));
      inventoryEvents.emit("reload", { weaponId: def.id, loaded: take });
    },
    addAmmo: (type, n) =>
      set((s) => ({
        ammo: { ...s.ammo, [type]: clamp((s.ammo[type] ?? 0) + n, 0, RESERVE_HARD_CAP) },
      })),

    pickupWeapon: (id, reserve) => {
      const def = WEAPONS[id];
      if (!def) return;
      const already = !!get().ownedWeapons[id];
      const reserveAdded = reserve ?? def.startingReserve;
      set((s) => {
        const owned = already
          ? s.ownedWeapons
          : { ...s.ownedWeapons, [id]: { defId: id, mag: def.magSize } };
        const ammo = def.ammoType
          ? {
              ...s.ammo,
              [def.ammoType]: clamp(
                (s.ammo[def.ammoType] ?? 0) + reserveAdded,
                0,
                Math.max(def.reserveMax, RESERVE_HARD_CAP),
              ),
            }
          : s.ammo;
        return { ownedWeapons: owned, ammo };
      });
      inventoryEvents.emit("pickup", { weaponId: id, reserveAdded });
    },
    useConsumable: (id) => {
      const def = CONSUMABLES[id];
      if (!def) return false;
      const count = get().consumables[id] ?? 0;
      if (count <= 0) return false;
      const now = Date.now();
      if (now < (get().cooldowns[id] ?? 0)) return false;
      set((s) => ({
        consumables: { ...s.consumables, [id]: (s.consumables[id] ?? 0) - 1 },
        cooldowns: { ...s.cooldowns, [id]: now + def.cooldownMs },
      }));
      // The actual health/armor application lives in the ECS layer (see systems.ts), which
      // listens for this event and writes the player's `health` component.
      inventoryEvents.emit("consumable", { id, kind: def.kind, amount: def.amount });
      return true;
    },
    bestHealItem: () => {
      const c = get().consumables;
      if ((c["medkit"] ?? 0) > 0) return "medkit";
      if ((c["snack_health"] ?? 0) > 0) return "snack_health";
      return null;
    },
    addCash: (n) => set((s) => ({ cash: clamp(s.cash + n, 0, 1_000_000_000) })),

    hydrate: (snap) => {
      const clean = sanitizeSnapshot({ ...get().toSnapshot(), ...snap });
      set(clean);
    },
    // Serializable snapshot slice only (skips transient fields + actions).
    toSnapshot: () => {
      const s = get();
      return {
        ownedWeapons: s.ownedWeapons,
        ammo: s.ammo,
        consumables: s.consumables,
        equippedWeaponId: s.equippedWeaponId,
        lastByCategory: s.lastByCategory,
        cash: s.cash,
        version: s.version,
      };
    },
  })),
);
