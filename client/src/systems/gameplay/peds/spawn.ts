// Population director: keep ~`cap` peds alive in a ring around the player, spawning just outside
// the near view (off-screen when a camera is known) and recycling any that drift past the cull
// radius. Density comes from the LOD governor (`currentCap`). Zero steady-state allocation.

import type { PedArchetype } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useGameStore } from "@/stores/game.store";
import {
  ARCHETYPE_WEIGHTS,
  ARCHETYPES,
  CULL_R,
  PED_ARM_MULT,
  PED_ARMED_FRACTION,
  PED_CENTER_Y,
  PED_WEAPONS,
  SPAWN_HZ,
  SPAWN_MAX_R,
  SPAWN_MIN_R,
  SPAWN_PER_TICK,
} from "./config";
import { getNav, randomNeighbor } from "./nav";
import { acquireEntity, returnEntity } from "./pool";
import { setAgentTarget } from "./reactions";
import { allocSlot, freeSlot, setInstanceAppearance } from "./render/pedInstances";
import { crowdLook } from "./render/crowdColors";
import { assignTickPhase, currentCap } from "./lod";
import { rand, weightedPick } from "./rng";
import { getPlayer, pedQuery, viewRef } from "./queries";

let nextNetId = 1_000_000; // high base so ped ids never collide with player/vehicles
const tmp = { x: 0, z: 0 };

/** Spawn a single ped in the ring around (px,pz). Returns false if it couldn't be placed. */
export function spawnOne(px: number, pz: number): boolean {
  const nav = getNav();
  const node = nav.randomNodeAround(px, pz, SPAWN_MIN_R, SPAWN_MAX_R, rand);
  if (node < 0) return false;
  nav.nodePos(node, tmp);

  // Off-screen bias: skip candidates roughly inside the camera's forward cone (avoids pop-in).
  if (viewRef.hasCamera) {
    const dx = tmp.x - viewRef.x;
    const dz = tmp.z - viewRef.z;
    const dl = Math.hypot(dx, dz) || 1;
    const dot = (dx / dl) * viewRef.fwdX + (dz / dl) * viewRef.fwdZ;
    if (dot > 0.35) return false; // ~within ±70° of view → try again next tick
  }

  const arch = weightedPick(ARCHETYPE_WEIGHTS, rand) as PedArchetype;
  const slot = allocSlot(arch);
  if (slot < 0) return false;
  const e = acquireEntity();
  if (!e) {
    freeSlot(arch, slot);
    return false;
  }

  const def = ARCHETYPES[arch];
  const a = e.ped_agent!;
  a.archetype = arch;
  a.node = node;
  a.target = -1;
  a.destX = tmp.x;
  a.destZ = tmp.z;
  a.vx = 0;
  a.vz = 0;
  a.speed = 0;
  // Per-ped walk-speed jitter so a crowd doesn't march at one uniform pace.
  a.maxSpeed = def.walk * (0.82 + rand() * 0.34);
  a.heading = rand() * Math.PI * 2;
  a.state = "wander";
  a.stateT = 0;
  a.fear = 0;
  a.fleeX = tmp.x;
  a.fleeZ = tmp.z;
  a.calmCooldown = 0;
  a.lod = 0;
  a.dist2 = 0;
  a.slot = slot;
  a.animPhase = rand();
  const look = crowdLook(arch, rand);
  a.bodyW = look.bodyW;
  a.bodyH = look.bodyH;
  a.age = 0;
  a.deadAt = 0;
  // Arm a random subset (gangsters/police far more likely; tourists never). Armed peds FIGHT.
  const armChance = PED_ARMED_FRACTION * (PED_ARM_MULT[arch] ?? 0);
  a.weapon = rand() < armChance ? (PED_WEAPONS[(rand() * PED_WEAPONS.length) | 0] ?? null) : null;
  a.fireT = 0;
  assignTickPhase(a, rand);

  e.ped!.archetype = arch;
  e.netId = nextNetId++;
  const hp = e.stat_health!;
  hp.max = def.health;
  hp.current = def.health;
  hp.armor = 0;
  const t = e.transform!;
  t.position.x = tmp.x;
  t.position.y = PED_CENTER_Y;
  t.position.z = tmp.z;
  t.rotation.x = 0;
  t.rotation.y = 0;
  t.rotation.z = 0;
  t.rotation.w = 1;

  world.add(e);
  setInstanceAppearance(arch, slot, look);

  const next = randomNeighbor(node, rand, -1);
  if (next >= 0) setAgentTarget(a, next);
  else {
    a.state = "idle";
    a.stateT = 1;
  }
  return true;
}

/** Recycle a ped: free its instance slot, strip death tags, remove from world, return to pool. */
export function releasePed(e: ClientEntity): void {
  const a = e.ped_agent;
  if (!a) return;
  freeSlot(a.archetype, a.slot);
  a.slot = -1;
  if (e.isDead) world.removeComponent(e, "isDead");
  if (e.ped_ragdoll) world.removeComponent(e, "ped_ragdoll");
  // Strip the transient knockback velocity a vehicle impact may have seeded (see pedCollidersView)
  // so a recycled pool entity never carries a stale launch into its next life.
  if (e.velocity) world.removeComponent(e, "velocity");
  world.remove(e);
  returnEntity(e);
}

let acc = 0;

/** Population maintenance tick (throttled to SPAWN_HZ). */
export function tickSpawn(dt: number): void {
  if (useGameStore.getState().phase !== "playing") return;
  acc += dt;
  if (acc < 1 / SPAWN_HZ) return;
  acc = 0;

  const player = getPlayer();
  if (!player?.transform && !viewRef.hasCamera) return;
  const px = player?.transform?.position.x ?? viewRef.x;
  const pz = player?.transform?.position.z ?? viewRef.z;

  // Cull peds that have drifted beyond the cull ring (they'll respawn near the player).
  const cull2 = CULL_R * CULL_R;
  let toRelease: ClientEntity[] | null = null;
  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state === "dead") continue;
    if (a.dist2 > cull2) (toRelease ??= []).push(e);
  }
  if (toRelease) for (const e of toRelease) releasePed(e);

  // Top up to the current cap.
  const cap = currentCap();
  let attempts = 0;
  while (pedQuery.entities.length < cap && attempts < SPAWN_PER_TICK) {
    spawnOne(px, pz);
    attempts++;
  }
}
