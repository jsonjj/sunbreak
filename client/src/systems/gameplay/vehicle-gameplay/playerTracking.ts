// Player world-position tracking that spans on-foot ↔ in-vehicle, plus the void safety-net respawn
// that replaces the (removed) boundary walls.
//
// While seated, the on-foot PlayerController early-returns (vg_occupant), so the player entity's
// `transform` stops updating — which used to leave the minimap marker + camera-center + police/AI
// targeting reading a STALE on-foot position. `syncOccupantPosition` mirrors the driven vehicle's
// live transform onto the player entity every frame, so every player-position reader (minimap,
// wanted crime LKP, foot cops, ped reactions) tracks the car/heli/boat. On exit, the controller
// resumes writing the transform from the body.

import type { Vec3 } from "@sunbreak/shared";
import { DEFAULT_SPAWN } from "@sunbreak/shared";
import { getPlayer, getVehicle } from "./queries";

/** Fall-through / out-of-bounds thresholds for the void respawn. */
const VOID_Y = -25;
const OUT_OF_BOUNDS = 700; // well beyond the ±565 safety floor
const SPAWN: Vec3 = { x: DEFAULT_SPAWN[0] ?? 0, y: DEFAULT_SPAWN[1] ?? 2, z: DEFAULT_SPAWN[2] ?? 0 };

/** Yaw (about +Y) from a quaternion — for the minimap heading while driving. */
function extractYaw(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

/** Mirror the occupied vehicle's transform onto the player entity so all readers track the vehicle. */
export function syncOccupantPosition(): void {
  const player = getPlayer();
  const occ = player?.vg_occupant;
  if (!player || !occ || !player.transform) return;
  const v = getVehicle(occ.vehicleNetId);
  const vt = v?.transform;
  if (!vt) return;
  const p = player.transform;
  p.position.x = vt.position.x;
  p.position.y = vt.position.y;
  p.position.z = vt.position.z;
  p.rotation.x = vt.rotation.x;
  p.rotation.y = vt.rotation.y;
  p.rotation.z = vt.rotation.z;
  p.rotation.w = vt.rotation.w;
  if (player.movement) {
    player.movement.facing = extractYaw(vt.rotation);
    const spd = (v as { veh_state?: { speed?: number } }).veh_state?.speed;
    if (typeof spd === "number") player.movement.speed = Math.abs(spd);
  }
}

interface TeleportableBody {
  setTranslation?: (t: Vec3, wake: boolean) => void;
  setLinvel?: (v: Vec3, wake: boolean) => void;
  setAngvel?: (v: Vec3, wake: boolean) => void;
  setRotation?: (q: { x: number; y: number; z: number; w: number }, wake: boolean) => void;
}

function teleportBody(body: unknown, pos: Vec3, upright: boolean): void {
  const b = body as TeleportableBody;
  try {
    b.setTranslation?.(pos, true);
    b.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
    if (upright) b.setRotation?.({ x: 0, y: 0, z: 0, w: 1 }, true);
  } catch {
    /* best effort — never break the frame over a teleport */
  }
}

/**
 * VOID SAFETY NET (replaces the boundary walls): if the player falls below the void plane or ends up
 * far outside the world — on foot OR while driving — teleport them back to the main spawn with all
 * velocity zeroed. In a vehicle we bring the car/heli/boat back too (the seated driver rides along).
 */
export function voidRespawnCheck(): void {
  const player = getPlayer();
  if (!player?.transform) return;
  const occ = player.vg_occupant;
  const vehicle = occ ? getVehicle(occ.vehicleNetId) : undefined;
  const pos = vehicle?.transform?.position ?? player.transform.position;

  if (pos.y >= VOID_Y && Math.abs(pos.x) <= OUT_OF_BOUNDS && Math.abs(pos.z) <= OUT_OF_BOUNDS) return;

  const dest: Vec3 = { x: SPAWN.x, y: Math.max(SPAWN.y, 3), z: SPAWN.z };
  if (vehicle?.rigidBody && vehicle.transform) {
    teleportBody(vehicle.rigidBody, dest, true);
    vehicle.transform.position.x = dest.x;
    vehicle.transform.position.y = dest.y;
    vehicle.transform.position.z = dest.z;
  } else if (player.rigidBody) {
    teleportBody(player.rigidBody, dest, false);
  }
  const pt = player.transform.position;
  pt.x = dest.x;
  pt.y = dest.y;
  pt.z = dest.z;
}
