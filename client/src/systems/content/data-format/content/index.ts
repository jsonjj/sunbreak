// content/data-format — seed content registration.
//
// Registers the first-party seed content (vehicles/weapons/npcs/missions/map) into the in-memory
// registry so every consumer has real data at boot. Fully non-throwing and idempotent: each item
// is validated + stored inside a try/catch so a single bad doc can never break app boot (v0).
import {
  registerMap,
  registerMission,
  registerNpc,
  registerVehicle,
  registerWeapon,
} from "../registry";
import { SEED_MAPS } from "./map-costa-dorada";
import { SEED_MISSIONS } from "./missions";
import { SEED_NPCS } from "./npcs";
import { SEED_VEHICLES } from "./vehicles";
import { SEED_WEAPONS } from "./weapons";

export { SEED_MAPS, SEED_MISSIONS, SEED_NPCS, SEED_VEHICLES, SEED_WEAPONS };

let seeded = false;

const seed = <T>(items: readonly T[], register: (item: T) => unknown, label: string): void => {
  for (const item of items) {
    try {
      register(item);
    } catch (err) {
      console.warn(`[content/data-format] failed to seed ${label}:`, err);
    }
  }
};

/** Validate + register all seed content once. Safe to call multiple times (idempotent). */
export const registerSeedContent = (): void => {
  if (seeded) return;
  seeded = true;
  seed(SEED_WEAPONS, registerWeapon, "weapon");
  seed(SEED_VEHICLES, registerVehicle, "vehicle");
  seed(SEED_NPCS, registerNpc, "npc");
  seed(SEED_MISSIONS, registerMission, "mission");
  seed(SEED_MAPS, registerMap, "map");
};
