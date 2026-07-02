// Local persistence — debounced localStorage cache of the inventory snapshot. Solo/offline
// only; the v4 online path (Colyseus authoritative + server SQLite) hydrates the SAME store, so
// UI code is identical in both modes. Never writes per-frame: coalesced with a debounce and
// flushed on pagehide/tab-hide.

import { z } from "zod";
import type { InventorySnapshot } from "./types";
import { useInventoryStore } from "./store";
import { sanitizeSnapshot } from "./rules";

const STORAGE_KEY = "sunbreak:inventory:v1";
const SAVE_DEBOUNCE_MS = 1200;

const weaponInstanceSchema = z.object({
  defId: z.string(),
  mag: z.number(),
  attachments: z.array(z.string()).optional(),
});

const snapshotSchema = z.object({
  ownedWeapons: z.record(z.string(), weaponInstanceSchema),
  ammo: z.record(z.string(), z.number()),
  consumables: z.record(z.string(), z.number()),
  equippedWeaponId: z.string().nullable(),
  lastByCategory: z.record(z.string(), z.string()),
  cash: z.number(),
  version: z.number(),
});

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load + validate the persisted snapshot, or null if absent/corrupt. */
export function loadInventory(): InventorySnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    // Re-run through the domain sanitizer so unknown/removed weapons can't wedge the game.
    return sanitizeSnapshot(parsed.data as Partial<InventorySnapshot>);
  } catch {
    return null;
  }
}

function write(snap: InventorySnapshot): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Quota/private-mode — degrade silently; game still runs from in-memory state.
  }
}

/** Force a synchronous save now (used on unload). */
export function flushNow(): void {
  write(useInventoryStore.getState().toSnapshot());
}

/** Hydrate the store from disk once (call before/at boot). */
export function hydrateFromStorage(): void {
  const snap = loadInventory();
  if (snap) useInventoryStore.getState().hydrate(snap);
}

/**
 * Subscribe the store to debounced autosave + flush on unload. Returns a cleanup fn.
 */
export function installPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flushNow();
    }, SAVE_DEBOUNCE_MS);
  };

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flushNow();
  };

  const onVisibility = (): void => {
    if (typeof document !== "undefined" && document.hidden) flush();
  };

  const unsub = useInventoryStore.subscribe(schedule);
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
  }

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
