// Local (localStorage) serialize/restore of per-character vitals. Server REST (POST /api/save,
// GET /api/load) can reuse `serialize()`/`restore()` when the persistence subsystem lands.
// Kept OFF the render hot path — index.ts autosaves on a low-frequency timer + on key events.

import { CharacterId } from "@sunbreak/shared";
import { SAVE_KEY } from "./constants";
import {
  allCharacters,
  characterIds,
  getActiveCharacter,
  loadCharacters,
  setActiveCharacter,
} from "./characters";
import type { StatsSave } from "./types";

export function serialize(): StatsSave {
  const characters: StatsSave["characters"] = {};
  const all = allCharacters();
  for (const id of characterIds()) {
    const v = all[id];
    characters[id] = {
      health: v.health,
      healthMax: v.healthMax,
      armor: v.armor,
      armorMax: v.armorMax,
      stamina: v.stamina,
      staminaSkill: v.staminaSkill,
      ability: v.ability,
      alive: v.alive,
    };
  }
  return { active: getActiveCharacter(), characters };
}

export function restore(save: StatsSave): void {
  if (save.active === CharacterId.Cami || save.active === CharacterId.Mac) {
    setActiveCharacter(save.active);
  }
  if (save.characters) loadCharacters(save.characters);
}

/** Load persisted vitals from localStorage. Returns true if a save was applied. */
export function loadSaved(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    restore(JSON.parse(raw) as StatsSave);
    return true;
  } catch {
    return false;
  }
}

export function writeSaved(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
  } catch {
    // quota exceeded / private mode — persistence is best-effort.
  }
}
