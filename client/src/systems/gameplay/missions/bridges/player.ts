// Player adapter — reads the local player straight off the ECS (set up by the v0 PlayerController)
// with a physics-body fallback. No hard dependency on the player subsystem's internals.

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { playerHandle } from "@/player/playerHandle";
import type { PlayerCtx } from "../types";
import type { Vec3 } from "../schema";

const players = world.with("isPlayer");
const missionSpawns = world.with("mission_spawnRef");

function playerEntity(): ClientEntity | null {
  return players.entities[0] ?? null;
}

export const playerCtx: PlayerCtx = {
  exists: () => playerEntity() != null || playerHandle.body != null,
  entity: playerEntity,
  position: () => {
    const e = playerEntity();
    if (e?.transform) {
      const p = e.transform.position;
      return [p.x, p.y, p.z];
    }
    const body = playerHandle.body;
    if (body) {
      const t = body.translation();
      return [t.x, t.y, t.z];
    }
    return [0, 0, 0];
  },
  health: () => playerEntity()?.health?.current ?? 100,
  inVehicleRef: () => {
    const seat = playerEntity()?.seat;
    if (!seat) return null;
    for (const v of missionSpawns) {
      if (v.netId === seat.vehicleNetId) return v.mission_spawnRef ?? String(seat.vehicleNetId);
    }
    return String(seat.vehicleNetId);
  },
};

/** Player position as a tuple (small convenience for handlers). */
export function playerPos(): Vec3 {
  return playerCtx.position();
}
