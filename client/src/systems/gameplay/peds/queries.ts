// Reused module-level queries + view/player accessors. miniplex caches archetypes, so building
// these once and iterating every frame avoids per-frame archetype churn.

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import "./components"; // register ped_* augmentations before querying them

/** All live peds (entities holding the core sim blob). */
export const pedQuery = world.with("ped_agent");

/** Local player(s). Player controller spawns one entity with these components. */
export const playerQuery = world.with("isPlayer", "transform");

/** Dead peds awaiting ragdoll handoff (queried by the ragdoll subsystem too). */
export const ragdollQuery = world.with("ped_ragdoll");

/**
 * View focus (camera) — the reference point for LOD + off-screen spawn tests. Published by the
 * mountable `<PedInstances/>` render component when present; otherwise LOD falls back to the
 * player position. Kept as a plain mutable ref (zero alloc).
 */
export const viewRef = {
  hasCamera: false,
  x: 0,
  y: 0,
  z: 0,
  /** Forward (XZ) unit vector — used to bias spawns off-screen. */
  fwdX: 0,
  fwdZ: -1,
};

/** Current player transform, or null before the player entity exists. */
export function getPlayer(): ClientEntity | null {
  return playerQuery.entities[0] ?? null;
}

/** Focus point for distance/LOD: camera if we have one, else the player, else origin. */
export function focusPoint(out: { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
} {
  if (viewRef.hasCamera) {
    out.x = viewRef.x;
    out.y = viewRef.y;
    out.z = viewRef.z;
    return out;
  }
  const p = getPlayer();
  if (p?.transform) {
    out.x = p.transform.position.x;
    out.y = p.transform.position.y;
    out.z = p.transform.position.z;
  } else {
    out.x = out.y = out.z = 0;
  }
  return out;
}
