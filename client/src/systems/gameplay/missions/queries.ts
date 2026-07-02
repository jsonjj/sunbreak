// Shared helpers for querying mission-owned entities (used by objectives, conditions, markers).

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { Vec3 } from "./schema";
import { vec3ToTuple } from "./util";

const missionRefQuery = world.with("mission_ref", "mission_spawnRef");

/** Is this entity considered alive (present, not tagged dead, positive health if it has any)? */
export function isAlive(e: ClientEntity): boolean {
  if (e.isDead) return false;
  if (e.health) return e.health.current > 0;
  return true;
}

export function spawnEntities(missionRef: string, spawnRef: string): ClientEntity[] {
  const out: ClientEntity[] = [];
  for (const e of missionRefQuery) {
    if (e.mission_ref === missionRef && e.mission_spawnRef === spawnRef) out.push(e);
  }
  return out;
}

export function firstSpawn(missionRef: string, spawnRef: string): ClientEntity | null {
  for (const e of missionRefQuery) {
    if (e.mission_ref === missionRef && e.mission_spawnRef === spawnRef) return e;
  }
  return null;
}

export function entityPos(e: ClientEntity): Vec3 | null {
  return e.transform ? vec3ToTuple(e.transform.position) : null;
}

/** Average X/Z position of a set of entities (marker centroid), or null if empty. */
export function centroid(entities: ClientEntity[]): Vec3 | null {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const e of entities) {
    if (!e.transform) continue;
    x += e.transform.position.x;
    y += e.transform.position.y;
    z += e.transform.position.z;
    n++;
  }
  return n ? [x / n, y / n, z / n] : null;
}
