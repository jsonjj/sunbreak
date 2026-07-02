// Gameplay cheats — teleport / spawn / god / heal / noclip / killall.
//
// These write through the SAME authoritative paths the game uses: the player's Rapier body for
// position, and miniplex `world` mutations for entities. There is no parallel simulation. In a
// future multiplayer build these would be routed through Colyseus dev handlers instead.

import type { Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { playerHandle } from "@/player/playerHandle";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { DbgSpawnKind } from "../debug.components";
import { useDebugStore } from "../store/debugStore";

const playerQuery = world.with("isPlayer", "transform");
const spawnedQuery = world.with("dbg_spawned");

/** Current player position from the ECS transform, falling back to the physics body. */
export function playerPosition(): Vec3 | null {
  const p = playerQuery.first;
  if (p?.transform) return { ...p.transform.position };
  const body = playerHandle.body;
  if (body) {
    const t = body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }
  return null;
}

/** Move the local player to an absolute world position. */
export function teleportTo(pos: Vec3): boolean {
  const body = playerHandle.body;
  const e = playerQuery.first;
  if (body) body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
  if (e?.transform) {
    e.transform.position.x = pos.x;
    e.transform.position.y = pos.y;
    e.transform.position.z = pos.z;
  }
  return Boolean(body || e);
}

// --- named waypoints (setwp / tp <name>) ------------------------------------------------
const waypoints = new Map<string, Vec3>();

export function setWaypoint(name: string): Vec3 | null {
  const pos = playerPosition();
  if (!pos) return null;
  waypoints.set(name, pos);
  return pos;
}
export function listWaypoints(): string[] {
  return [...waypoints.keys()];
}

/** `tp <x y z>` or `tp <waypoint>`. Returns a human-readable result for the console. */
export function teleport(args: string[]): string {
  if (args.length >= 3) {
    const x = Number(args[0]);
    const y = Number(args[1]);
    const z = Number(args[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return "tp: coordinates must be numbers";
    }
    return teleportTo({ x, y, z })
      ? `teleported to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`
      : "tp: no player to move";
  }
  const name = args[0];
  if (!name) return "usage: tp <x y z> | tp <waypoint>";
  const wp = waypoints.get(name);
  if (!wp) return `tp: unknown waypoint '${name}' (have: ${listWaypoints().join(", ") || "none"})`;
  return teleportTo(wp) ? `teleported to waypoint '${name}'` : "tp: no player to move";
}

// --- spawning ---------------------------------------------------------------------------
const KIND_COLOR: Record<DbgSpawnKind, number> = {
  car: 0x4a90d9,
  ped: 0x8ec07c,
  prop: 0xffb454,
};

/** Add a debug entity in front of the player. It renders via the canvas layer's ECS bridge. */
export function spawnEntity(kind: DbgSpawnKind = "prop"): ClientEntity {
  const p = playerQuery.first;
  const base = p?.transform?.position ?? null;
  const facing = p?.movement?.facing ?? 0;
  const dist = kind === "car" ? 6 : 3;
  const fx = -Math.sin(facing);
  const fz = -Math.cos(facing);
  const pos: Vec3 = base
    ? { x: base.x + fx * dist, y: base.y + 0.6, z: base.z + fz * dist }
    : { x: 0, y: 1, z: -dist };

  const entity: ClientEntity = {
    transform: { position: pos, rotation: { x: 0, y: facing, z: 0, w: 1 } },
    dbg_spawned: true,
    dbg_kind: kind,
    dbg_color: KIND_COLOR[kind],
    dbg_label: `dbg:${kind}`,
  };
  if (kind === "ped") entity.isPed = true;
  else if (kind === "car") entity.isVehicle = true;
  else entity.isProp = true;

  world.add(entity);
  return entity;
}

/** `spawn <car|ped|prop>` for the console. */
export function spawn(kindArg?: string): string {
  const kind: DbgSpawnKind =
    kindArg === "car" || kindArg === "ped" || kindArg === "prop" ? kindArg : "prop";
  spawnEntity(kind);
  return `spawned ${kind}`;
}

/** Remove every entity this subsystem spawned. */
export function killDbgSpawned(): number {
  const list = [...spawnedQuery.entities];
  for (const e of list) world.remove(e);
  return list.length;
}

// --- god / heal / noclip ----------------------------------------------------------------
/** Toggle (or set) invulnerability on the player. The `dbg:god` system enforces it per-frame. */
export function setGod(on?: boolean): boolean {
  const next = on ?? !useDebugStore.getState().god;
  useDebugStore.getState().set({ god: next });
  const p = playerQuery.first;
  if (p) {
    if (next) {
      if (!p.dbg_god) world.addComponent(p, "dbg_god", true);
      if (p.health) p.health.current = p.health.max;
    } else if (p.dbg_god) {
      world.removeComponent(p, "dbg_god");
    }
  }
  return next;
}

/** Restore player health/armor to full once. */
export function heal(): boolean {
  const p = playerQuery.first;
  if (!p?.health) return false;
  p.health.current = p.health.max;
  p.health.armor = Math.max(p.health.armor, 100);
  return true;
}

/** Toggle the noclip marker. Full pass-through movement needs player-controller cooperation
 *  (see the integrator notes) — this exposes the intent + tag so that layer can honour it. */
export function setNoclip(on?: boolean): boolean {
  const next = on ?? !useDebugStore.getState().noclip;
  useDebugStore.getState().set({ noclip: next });
  const p = playerQuery.first;
  if (p) {
    if (next && !p.dbg_noclip) world.addComponent(p, "dbg_noclip", true);
    else if (!next && p.dbg_noclip) world.removeComponent(p, "dbg_noclip");
  }
  return next;
}

/** Grouped facade passed into console commands / exported for other subsystems. */
export const cheats = {
  playerPosition,
  teleportTo,
  teleport,
  setWaypoint,
  listWaypoints,
  spawnEntity,
  spawn,
  killDbgSpawned,
  setGod,
  heal,
  setNoclip,
};

export type Cheats = typeof cheats;
