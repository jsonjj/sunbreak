// Per-character (Cami / Mac) vitals registry. The ECS player entity is the LIVE authority for
// the active lead; this registry is the persistence buffer + the holding cell for the inactive
// lead's vitals while the other is played. Snapshot/switch helpers that touch the ECS live in
// `entityVitals.ts`.

import { CharacterId } from "@sunbreak/shared";
import { staminaMaxForSkill } from "./constants";
import { freshVitals } from "./vitals";
import type { PersistedVitals, Vitals } from "./types";

const CHARACTER_IDS: readonly CharacterId[] = [CharacterId.Cami, CharacterId.Mac];

const records: Record<CharacterId, Vitals> = {
  [CharacterId.Cami]: freshVitals(),
  [CharacterId.Mac]: freshVitals(),
};

let active: CharacterId = CharacterId.Cami;

export function characterIds(): readonly CharacterId[] {
  return CHARACTER_IDS;
}

export function getActiveCharacter(): CharacterId {
  return active;
}

export function setActiveCharacter(id: CharacterId): void {
  active = id;
}

export function getCharacter(id: CharacterId): Vitals {
  return records[id];
}

export function setCharacter(id: CharacterId, vitals: Vitals): void {
  records[id] = vitals;
}

export function allCharacters(): Record<CharacterId, Vitals> {
  return records;
}

/** Merge persisted partials into the in-memory records; transient combat timers are reset. */
export function loadCharacters(
  data: Partial<Record<CharacterId, Partial<PersistedVitals>>>,
): void {
  for (const id of CHARACTER_IDS) {
    const saved = data[id];
    if (!saved) continue;
    const current = records[id];
    const staminaSkill = saved.staminaSkill ?? current.staminaSkill;
    records[id] = {
      ...current,
      ...saved,
      staminaSkill,
      stamina: saved.stamina ?? staminaMaxForSkill(staminaSkill),
      // performance.now() resets across reloads, so a persisted timestamp is meaningless.
      lastDamageAt: 0,
    };
  }
}
