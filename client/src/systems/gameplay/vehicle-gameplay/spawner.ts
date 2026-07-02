// Vehicle lifecycle: build/tear-down ECS vehicle entities and a simple free-list pool.
//
// We create *sim + handoff* components only — NO THREE/Rapier handles. The render/asset
// subsystem instantiates a model for entities carrying `spawn.prefab` + `three`; vehicle-physics
// attaches the RigidBody + controller for entities carrying `veh_spec`. This is the "render
// through the ECS↔R3F bridge, don't hand-mount" contract.

import { VehicleId } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { VG_NETID_BASE, WRECK_DESPAWN_SEC, getSpec } from "./config";
import { initHealth } from "./damage";
import { getPlayer, getVehicle, vgQueries } from "./queries";
import { VEHICLE_SPAWNS } from "./spawns";
import type { VehicleSpecId } from "./types";
import { clearSpeedCache, forgetSpeed } from "./speed";
import { forgetFlightState } from "./flightDrive";
import { useVehicleStore } from "./store";
import { emptyDriverInput } from "./types";
import { nowSec, quatFromYaw } from "./util";
import { unfreezePlayer } from "./playerBridge";

export interface SpawnPlace {
  x: number;
  z: number;
  yaw?: number;
  y?: number; // defaults to resting on the ground for the spec
  parked?: boolean;
}

type Target = number | ClientEntity;

let nextNetId = VG_NETID_BASE;
const freeList = new Map<VehicleSpecId, ClientEntity[]>();

const resolve = (t: Target): ClientEntity | undefined =>
  typeof t === "number" ? getVehicle(t) : t;

/** Write a fresh set of vehicle components onto an entity (used by spawn + pool reuse). */
function configureVehicle(e: ClientEntity, spec: VehicleSpecId, place: SpawnPlace): ClientEntity {
  const s = getSpec(spec);
  const restY = place.y ?? s.halfExtents.y + 0.15;
  e.netId ??= nextNetId++;
  e.isVehicle = true;
  e.isActive = true;
  e.vg_vehicle = true;
  if (place.parked) e.vg_parked = true;
  else delete e.vg_parked;
  e.transform = {
    position: { x: place.x, y: restY, z: place.z },
    rotation: quatFromYaw(place.yaw ?? 0),
  };
  e.velocity = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
  // `VehicleComp.id` is the shared VehicleId enum; extended (string) ids ride through as a tag —
  // no cross-subsystem consumer switches on it exhaustively (verified: only label/audio display).
  e.vehicle = { id: spec as VehicleId, seats: s.seats.length, occupants: [], engineOn: false, speedKmh: 0 };
  e.spawn = { prefab: s.prefab };
  e.veh_spec = spec;
  // Hand off to vehicle-physics: this spawn request is promoted into a full Rapier vehicle
  // (physics' intake system adds veh_config/veh_state/veh_isVehicle → its VehicleBody mounts the
  // chassis). Gameplay seeds the driver-intent + engine-health channels physics reads/writes.
  e.veh_spawnRequest = { spec, position: [place.x, restY, place.z], rotationY: place.yaw ?? 0 };
  e.veh_input = { ...emptyDriverInput(), handbrake: true }; // parked handbrake
  e.veh_engineHealth = 1;
  e.vg_health = initHealth(spec);
  e.vg_seatCount = s.seats.length;
  return e;
}

/** Create a new gameplay vehicle entity. Physics + render subsystems pick it up via its comps. */
export function spawnVehicle(spec: VehicleSpecId, place: SpawnPlace): ClientEntity {
  const e = configureVehicle({}, spec, place);
  world.add(e);
  return e;
}

/** Remove a vehicle, freeing its speed cache and force-exiting the player if they were inside. */
export function despawnVehicle(target: Target): void {
  const e = resolve(target);
  if (!e) return;
  const netId = e.netId;
  if (netId !== undefined) {
    const player = getPlayer();
    if (player?.vg_occupant?.vehicleNetId === netId) {
      world.removeComponent(player, "vg_occupant");
      unfreezePlayer(player);
      useVehicleStore.getState().patch({ fsm: "onFoot", occupancy: null, activeVehicleId: null });
    }
    forgetSpeed(netId);
    forgetFlightState(netId);
    const pool = freeList.get(e.veh_spec ?? VehicleId.Sedan);
    if (pool) {
      const i = pool.indexOf(e);
      if (i >= 0) pool.splice(i, 1);
    }
  }
  world.remove(e);
}

// ── Free-list pool (v2 traffic/mission surface) ──────────────────────────────────────────
/** Reuse a released vehicle of `spec` if one is available, otherwise spawn a fresh one. */
export function acquireVehicle(spec: VehicleSpecId, place: SpawnPlace): ClientEntity {
  const pool = freeList.get(spec);
  const reused = pool?.pop();
  if (reused) {
    configureVehicle(reused, spec, place);
    world.add(reused);
    return reused;
  }
  return spawnVehicle(spec, place);
}

/** Return a vehicle to the pool (removed from the world, kept for reuse). Idempotent-ish. */
export function releaseVehicle(target: Target): void {
  const e = resolve(target);
  if (!e) return;
  if (e.netId !== undefined) {
    forgetSpeed(e.netId);
    forgetFlightState(e.netId);
  }
  world.remove(e);
  const spec = e.veh_spec ?? VehicleId.Sedan;
  const pool = freeList.get(spec) ?? [];
  if (!pool.includes(e)) pool.push(e);
  freeList.set(spec, pool);
}

// ── Bootstrap + maintenance systems ──────────────────────────────────────────────────────
let bootstrapped = false;

/** Update phase (once): spawn the v1 parked fleet as soon as the player exists. */
export function spawnBootstrapSystem(): void {
  if (bootstrapped) return;
  const player = getPlayer();
  if (!player?.transform) return; // wait for <PlayerController> to spawn the player
  for (const p of VEHICLE_SPAWNS) {
    spawnVehicle(p.spec, { x: p.x, z: p.z, y: p.y, yaw: p.yaw, parked: true });
  }
  bootstrapped = true;
}

/** Update phase: despawn wrecks once their timer elapses. */
export function wreckSweepSystem(): void {
  const now = nowSec();
  // Snapshot because despawn mutates the query.
  const wrecks: ClientEntity[] = [];
  for (const e of vgQueries.vehicles.entities) {
    const h = e.vg_health;
    if (h?.stage === "wrecked" && h.wreckedAtSec > 0 && now - h.wreckedAtSec > WRECK_DESPAWN_SEC) {
      wrecks.push(e);
    }
  }
  for (const e of wrecks) despawnVehicle(e);
}

/** Cleanup for init()'s disposer: remove every vehicle + reset pool/bootstrap state. */
export function resetSpawner(): void {
  for (const e of [...vgQueries.vehicles.entities]) world.remove(e);
  freeList.clear();
  clearSpeedCache();
  bootstrapped = false;
  nextNetId = VG_NETID_BASE;
}
