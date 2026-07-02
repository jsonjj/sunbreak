// Pooled police-unit factory. Pre-allocates a fixed set of ECS entities ONCE and toggles a
// `wanted_active` tag to deploy / recycle them (never add/remove bodies mid-chase — the spec's
// pooling rule). Units reuse the shared ped/vehicle component patterns (transform, velocity,
// health, ai, movement, isVehicle/vehicle or isPed/ped) so the ECS↔R3F bridge and other
// subsystems treat them like any ped/vehicle, discriminated by the `wanted_police` marker.
import { PedArchetype, VehicleId, type Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { Agency, PoliceRole, UnitArchetype } from "./types";
import { ARCHETYPE_PERCEPTION, GROUND_Y, UNIT_SPEED, UNIT_STANDOFF } from "./tuning";
import { now } from "./clock";

const FAR: Vec3 = { x: 100000, y: -1000, z: 100000 };
const NET_BASE = 900000;

let pool: ClientEntity[] = [];

const agencyFor = (a: UnitArchetype): Agency =>
  a === "srtVan" ? "SRT" : a === "unmarked" ? "VSP" : "SVPD";

function setComp<K extends keyof ClientEntity>(e: ClientEntity, key: K, value: ClientEntity[K]): void {
  if (e[key] !== undefined) world.removeComponent(e, key);
  world.addComponent(e, key, value);
}

function clearComp(e: ClientEntity, key: keyof ClientEntity): void {
  if (e[key] !== undefined) world.removeComponent(e, key);
}

function configureArchetype(e: ClientEntity, archetype: UnitArchetype): void {
  if (archetype === "foot") {
    clearComp(e, "isVehicle");
    clearComp(e, "vehicle");
    if (e.isPed === undefined) world.addComponent(e, "isPed", true);
    setComp(e, "ped", { archetype: PedArchetype.Police });
  } else {
    clearComp(e, "isPed");
    clearComp(e, "ped");
    if (e.isVehicle === undefined) world.addComponent(e, "isVehicle", true);
    setComp(e, "vehicle", {
      id: VehicleId.Police,
      seats: 2,
      occupants: [],
      engineOn: true,
      speedKmh: 0,
    });
  }
}

/** Create the idle pool once. Safe to call repeatedly (no-op after the first). */
export function initPool(size: number): void {
  if (pool.length > 0) return;
  for (let i = 0; i < size; i++) {
    const e: ClientEntity = {
      netId: NET_BASE + i,
      transform: {
        position: { x: FAR.x, y: FAR.y, z: FAR.z },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      velocity: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
      health: { current: 120, max: 120, armor: 40 },
      movement: { speed: 0, normalizedSpeed: 0, mode: "idle", grounded: true, facing: 0 },
      ai: { behavior: "idle" },
      wanted_police: {
        archetype: "cruiser",
        role: "pursuer",
        agency: "SVPD",
        fsm: "RETURN",
        spawnedAt: 0,
      },
      wanted_perception: {
        fovDeg: ARCHETYPE_PERCEPTION.cruiser.fovDeg,
        range: ARCHETYPE_PERCEPTION.cruiser.range,
        hearRange: ARCHETYPE_PERCEPTION.cruiser.hearRange,
        lastSeenAt: -Infinity,
      },
    };
    world.add(e);
    pool.push(e);
  }
}

/** Deploy an idle unit at `pos` locked onto `targetNetId`. Returns null if the pool is empty. */
export function acquire(
  archetype: UnitArchetype,
  role: PoliceRole,
  pos: { x: number; z: number },
  targetNetId: number,
): ClientEntity | null {
  const e = pool.find((p) => p.wanted_active === undefined && p.wanted_roadblock === undefined);
  if (!e) return null;

  const t = now();
  const y = archetype === "foot" ? GROUND_Y.foot : GROUND_Y.car;
  configureArchetype(e, archetype);

  e.transform!.position.x = pos.x;
  e.transform!.position.y = y;
  e.transform!.position.z = pos.z;

  const perc = ARCHETYPE_PERCEPTION[archetype];
  e.wanted_police = { archetype, role, agency: agencyFor(archetype), fsm: "PURSUE", spawnedAt: t };
  e.wanted_perception = {
    fovDeg: perc.fovDeg,
    range: perc.range,
    hearRange: perc.hearRange,
    lastSeenAt: t,
  };
  e.health = { current: 120, max: 120, armor: 40 };
  if (e.movement) e.movement.speed = 0;
  if (e.ai) e.ai.behavior = "drive";

  setComp(e, "wanted_pursuit", {
    targetNetId,
    speed: UNIT_SPEED[archetype],
    desiredDist: UNIT_STANDOFF[archetype],
  });
  clearComp(e, "wanted_search");
  if (e.wanted_active === undefined) world.addComponent(e, "wanted_active", true);
  if (e.isActive === undefined) world.addComponent(e, "isActive", true);
  return e;
}

/** Deploy a static roadblock prop (a parked cruiser) at `pos`. */
export function acquireRoadblock(pos: { x: number; z: number }, facing: number): ClientEntity | null {
  const e = pool.find((p) => p.wanted_active === undefined && p.wanted_roadblock === undefined);
  if (!e) return null;
  const t = now();
  configureArchetype(e, "cruiser");
  e.transform!.position.x = pos.x;
  e.transform!.position.y = GROUND_Y.car;
  e.transform!.position.z = pos.z;
  e.transform!.rotation = { x: 0, y: 0, z: 0, w: 1 };
  if (e.movement) e.movement.facing = facing;
  e.wanted_police = { archetype: "cruiser", role: "blocker", agency: "SVPD", fsm: "PATROL", spawnedAt: t };
  clearComp(e, "wanted_pursuit");
  clearComp(e, "wanted_search");
  if (e.wanted_roadblock === undefined) world.addComponent(e, "wanted_roadblock", true);
  if (e.wanted_active === undefined) world.addComponent(e, "wanted_active", true);
  if (e.isActive === undefined) world.addComponent(e, "isActive", true);
  return e;
}

/** Recycle a unit back to the idle pool (off-screen). */
export function release(e: ClientEntity): void {
  clearComp(e, "wanted_active");
  clearComp(e, "wanted_roadblock");
  clearComp(e, "isActive");
  clearComp(e, "wanted_pursuit");
  clearComp(e, "wanted_search");
  if (e.wanted_police) e.wanted_police.fsm = "RETURN";
  if (e.transform) {
    e.transform.position.x = FAR.x;
    e.transform.position.y = FAR.y;
    e.transform.position.z = FAR.z;
  }
  if (e.movement) e.movement.speed = 0;
}

/** Recycle every deployed unit (heat cleared / arrest / death / subsystem teardown). */
export function releaseAll(): void {
  for (const e of pool) if (e.wanted_active !== undefined || e.wanted_roadblock !== undefined) release(e);
}

export const pooledSize = (): number => pool.length;
export const activeCount = (): number =>
  pool.reduce((n, e) => n + (e.wanted_active !== undefined ? 1 : 0), 0);

/** Full teardown for the subsystem's cleanup: recycle + drop pool entities from the world. */
export function destroyPool(): void {
  for (const e of pool) world.remove(e);
  pool = [];
}
