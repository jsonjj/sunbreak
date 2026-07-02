// Map/blips port — how activity markers + objective waypoints reach the minimap.
//
// PRIMARY (when Map lands): the integrator injects an adapter over useMapStore
// (upsertBlip/removeBlip). See configureActivityPorts().
//
// FALLBACK (default, works today): write to the shared HUD blip channel (useHudStore.blips,
// the `Blip[]` shape from @sunbreak/shared). We only ever touch our own `act_`-prefixed blips,
// merging around any blips other subsystems add, so nothing gets clobbered.

import { useHudStore } from "@/stores/hud.store";
import type { Blip, BlipKind } from "@sunbreak/shared";

/** Subset of BlipKind that activities use. */
export type ActivityBlipKind = Extract<BlipKind, "mission" | "waypoint" | "shop" | "enemy">;

export interface ActivityBlip {
  /** Must be `act_`-prefixed so the fallback can identify owned blips. */
  id: string;
  x: number;
  z: number;
  kind: ActivityBlipKind;
  label?: string;
}

export interface BlipsPort {
  upsert(blip: ActivityBlip): void;
  remove(id: string): void;
  /** Remove every activity-owned blip. */
  clearOwned(): void;
}

const OWNED = (id: string): boolean => id.startsWith("act_");

export function createDefaultBlipsPort(): BlipsPort {
  const setBlips = (next: (prev: Blip[]) => Blip[]) => {
    const hud = useHudStore.getState();
    hud.patch({ blips: next(hud.blips) });
  };

  return {
    upsert(blip) {
      const b: Blip = { id: blip.id, x: blip.x, z: blip.z, kind: blip.kind, label: blip.label };
      setBlips((prev) => {
        const i = prev.findIndex((p) => p.id === b.id);
        if (i === -1) return [...prev, b];
        const copy = prev.slice();
        copy[i] = b;
        return copy;
      });
    },
    remove(id) {
      setBlips((prev) => prev.filter((p) => p.id !== id));
    },
    clearOwned() {
      setBlips((prev) => prev.filter((p) => !OWNED(p.id)));
    },
  };
}
