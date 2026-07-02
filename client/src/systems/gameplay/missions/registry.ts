// Mission registry — eagerly import every `./data/*.mission.json`, Zod-validate it, and expose a
// lookup. Invalid files are logged and skipped (one bad mission never crashes the game).

import { safeParseMission, type MissionDef } from "./schema";

const files = import.meta.glob("./data/*.mission.json", { eager: true, import: "default" });

export const MISSIONS: Record<string, MissionDef> = {};

for (const [path, raw] of Object.entries(files)) {
  const result = safeParseMission(raw);
  if (!result.success) {
    console.warn(`[missions] skipping invalid mission "${path}":`, result.error.issues);
    continue;
  }
  const def = result.data;
  if (MISSIONS[def.id]) {
    console.warn(`[missions] duplicate mission id "${def.id}" (${path}) — ignoring the duplicate`);
    continue;
  }
  MISSIONS[def.id] = def;
}

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS[id];
}

export function allMissions(): MissionDef[] {
  return Object.values(MISSIONS);
}
