// Object pool for ped entities. Pre-allocates PED_HARD_CAP entity objects (each with a persistent
// `ped_agent` blob, `transform`, and `stat_health`) so spawning/despawning hundreds of peds never
// allocates on the hot path — we recycle the same objects, only mutating their fields.

import { PedArchetype } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import { PED_CENTER_Y, PED_HARD_CAP } from "./config";
import type { PedAgent } from "./types";

const free: ClientEntity[] = [];
let warmed = false;

function makeAgent(): PedAgent {
  return {
    archetype: PedArchetype.Civilian,
    node: -1,
    target: -1,
    destX: 0,
    destZ: 0,
    vx: 0,
    vz: 0,
    speed: 0,
    maxSpeed: 1.3,
    heading: 0,
    state: "idle",
    stateT: 0,
    fear: 0,
    fleeX: 0,
    fleeZ: 0,
    calmCooldown: 0,
    lod: 0,
    tickPhase: 0,
    dist2: 0,
    slot: -1,
    animPhase: 0,
    bodyW: 1,
    bodyH: 1,
    weapon: null,
    fireT: 0,
    age: 0,
    deadAt: 0,
  };
}

function makeEntity(): ClientEntity {
  return {
    isPed: true,
    isActive: true,
    netId: 0,
    ped: { archetype: PedArchetype.Civilian },
    transform: {
      position: { x: 0, y: PED_CENTER_Y, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    stat_health: { current: 100, max: 100, armor: 0 },
    ped_agent: makeAgent(),
  };
}

/** Pre-create the whole pool once (called from init). */
export function warmPool(): void {
  if (warmed) return;
  warmed = true;
  for (let i = 0; i < PED_HARD_CAP; i++) free.push(makeEntity());
}

/** Take a parked entity (NOT yet in the world). Returns null when the pool is exhausted. */
export function acquireEntity(): ClientEntity | null {
  return free.pop() ?? null;
}

/** Return an entity to the pool (caller must have already removed it from the world). */
export function returnEntity(e: ClientEntity): void {
  free.push(e);
}

export const freeCount = (): number => free.length;

/** Drop all pooled entities (cleanup). */
export function clearPool(): void {
  free.length = 0;
  warmed = false;
}
