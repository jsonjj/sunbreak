// Shared, non-React module state for the focus + input systems (kept out of the zustand store so
// the 60 Hz dispatch loop can read live refs with zero React churn). Also owns the interactable
// archetype query, stable id resolution, the player snapshot, and the viewpoint fed by the rig.

import * as THREE from "three";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { PlayerRef, RapierContext } from "./types";

/** Connected query of every interactable entity (auto-updates as `interact_` is added/removed). */
export const interactables = world.with("interact_");

/** Query of the local player (position source + LOS exclusion body). */
const players = world.with("isPlayer");

// ── Focused entity (module ref; mirrored into the store as an id) ───────────────────────────────
let focused: ClientEntity | null = null;
export const getFocusedEntity = (): ClientEntity | null => focused;
export const setFocusedEntity = (entity: ClientEntity | null): void => {
  focused = entity;
};

// ── Viewpoint (camera position + forward), fed each frame by <InteractionRig> ───────────────────
export const viewpoint = {
  active: false,
  hasForward: false,
  px: 0,
  py: 0,
  pz: 0,
  fx: 0,
  fy: 0,
  fz: -1,
};

export function setViewpoint(
  px: number,
  py: number,
  pz: number,
  fx: number,
  fy: number,
  fz: number,
): void {
  viewpoint.active = true;
  viewpoint.hasForward = true;
  viewpoint.px = px;
  viewpoint.py = py;
  viewpoint.pz = pz;
  viewpoint.fx = fx;
  viewpoint.fy = fy;
  viewpoint.fz = fz;
}

export function clearViewpoint(): void {
  viewpoint.active = false;
  viewpoint.hasForward = false;
}

// ── Live Rapier context (present only while the rig is mounted; enables LOS + aim picks) ─────────
let rapier: RapierContext | null = null;
export const getRapier = (): RapierContext | null => rapier;
export const setRapier = (ctx: RapierContext | null): void => {
  rapier = ctx;
};

// ── Stable ids ──────────────────────────────────────────────────────────────────────────────────
let idCounter = 0;
const autoIds = new WeakMap<object, string>();

/** Resolve a stable HUD/debug id for an interactable: explicit id → net id → auto id. */
export function resolveId(entity: ClientEntity): string {
  const cfg = entity.interact_;
  if (cfg?.id) return cfg.id;
  if (typeof entity.netId === "number") return `net:${entity.netId}`;
  let id = autoIds.get(entity as object);
  if (!id) {
    id = `ix:${++idCounter}`;
    autoIds.set(entity as object, id);
  }
  return id;
}

// ── Player snapshot (reused object; do not retain across ticks) ─────────────────────────────────
const playerRef: PlayerRef = {
  entity: null,
  netId: null,
  position: { x: 0, y: 0, z: 0 },
  body: null,
};

export function getPlayerRef(): PlayerRef | null {
  const p = players.entities[0];
  if (!p) return null;
  playerRef.entity = p;
  playerRef.netId = typeof p.netId === "number" ? p.netId : null;
  const body = p.rigidBody ?? null;
  playerRef.body = body;
  if (body) {
    const t = body.translation();
    playerRef.position.x = t.x;
    playerRef.position.y = t.y;
    playerRef.position.z = t.z;
  } else if (p.transform) {
    playerRef.position.x = p.transform.position.x;
    playerRef.position.y = p.transform.position.y;
    playerRef.position.z = p.transform.position.z;
  } else {
    return null;
  }
  return playerRef;
}

// ── Entity world position (rigidbody → transform → three), written into `out` ────────────────────
export function entityPosition(entity: ClientEntity, out: THREE.Vector3): boolean {
  const body = entity.rigidBody;
  if (body) {
    const t = body.translation();
    out.set(t.x, t.y, t.z);
    return true;
  }
  if (entity.transform) {
    const p = entity.transform.position;
    out.set(p.x, p.y, p.z);
    return true;
  }
  if (entity.three) {
    entity.three.getWorldPosition(out);
    return true;
  }
  return false;
}
