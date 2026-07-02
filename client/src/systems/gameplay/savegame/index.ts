// gameplay/savegame — the central save/load orchestrator + 3-slot localStorage store.
//
// Self-registers (no per-frame systems) so the systems-loader picks it up; the real surface is
// `savegameApi` (imperative, for menus) + `useSavegameStore` (reactive slot list for the UI).
// A slot captures the FULL run: economy wallet/skills/inventory, stats/vitals, mission progress,
// and the player's world position — restored atomically on load.

import type { SubsystemModule } from "@sunbreak/shared";
import { create } from "zustand";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import { restoreGame, resetGame, snapshotGame, type SaveData, type SaveMeta } from "./orchestrator";

type W = typeof world;

const SLOTS = [1, 2, 3] as const;
const slotKey = (n: number): string => `sunbreak:save:slot${n}`;

function readSlot(n: number): SaveData | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(slotKey(n));
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

function writeSlot(n: number, data: SaveData): void {
  try {
    localStorage?.setItem(slotKey(n), JSON.stringify(data));
  } catch {
    /* quota / private mode — best effort */
  }
}

function deleteSlot(n: number): void {
  try {
    localStorage?.removeItem(slotKey(n));
  } catch {
    /* ignore */
  }
}

function listMetas(): (SaveMeta | null)[] {
  return SLOTS.map((n) => readSlot(n)?.meta ?? null);
}

interface SaveStoreState {
  /** Slot the current run is bound to (Pause "Save" writes here). */
  current: number | null;
  /** Per-slot metadata for the menu (index 0 = slot 1). */
  metas: (SaveMeta | null)[];
  refresh: () => void;
  setCurrent: (n: number | null) => void;
}

export const useSavegameStore = create<SaveStoreState>((set) => ({
  current: null,
  metas: listMetas(),
  refresh: () => set({ metas: listMetas() }),
  setCurrent: (current) => set({ current }),
}));

/** Imperative save/load surface for the menus + debug console. */
export const savegameApi = {
  slots: (): (SaveMeta | null)[] => useSavegameStore.getState().metas,
  currentSlot: (): number | null => useSavegameStore.getState().current,
  hasSave: (slot: number): boolean => readSlot(slot) !== null,
  /** Snapshot the live run to a slot (defaults to the current slot, else slot 1). */
  save: (slot?: number): number => {
    const n = slot ?? useSavegameStore.getState().current ?? 1;
    writeSlot(n, snapshotGame(n));
    useSavegameStore.getState().setCurrent(n);
    useSavegameStore.getState().refresh();
    return n;
  },
  /** Restore a slot into the live stores + world. Returns false if the slot is empty. */
  load: (slot: number): boolean => {
    const data = readSlot(slot);
    if (!data) return false;
    restoreGame(data);
    useSavegameStore.getState().setCurrent(slot);
    return true;
  },
  /** Begin a fresh run bound to a slot (resets economy + missions + spawn). */
  newGame: (slot: number): void => {
    resetGame();
    useSavegameStore.getState().setCurrent(slot);
    useSavegameStore.getState().refresh();
  },
  delete: (slot: number): void => {
    deleteSlot(slot);
    useSavegameStore.getState().refresh();
  },
} as const;

export type SavegameApi = typeof savegameApi;
export type { SaveMeta, SaveData, SavedPosition } from "./orchestrator";

// Expose a dev handle for quick testing from the console.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __sunbreakSave?: SavegameApi }).__sunbreakSave = savegameApi;
}

export const savegame: SubsystemModule<W> = { id: "gameplay/savegame" };
registerModule(savegame);
