// Checkpoint snapshot/restore. On a stage marked `checkpoint: true` we snapshot the player on
// entry; on failure the runtime rewinds the player here and re-enters the stage instead of aborting.

import { playerHandle } from "@/player/playerHandle";
import type { MissionCtx } from "./types";
import type { Vec3 } from "./schema";

export interface Checkpoint {
  stageIndex: number;
  playerPos: Vec3;
  playerHealth: number;
}

export function snapshot(ctx: MissionCtx, stageIndex: number): Checkpoint {
  return {
    stageIndex,
    playerPos: ctx.player.position(),
    playerHealth: ctx.player.health(),
  };
}

export function restore(cp: Checkpoint, ctx: MissionCtx): void {
  const [x, y, z] = cp.playerPos;

  // Teleport the kinematic player body (authoritative) and mirror into the ECS transform.
  const body = playerHandle.body;
  if (body) {
    body.setTranslation({ x, y, z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  const e = ctx.player.entity();
  if (e?.transform) {
    e.transform.position.x = x;
    e.transform.position.y = y;
    e.transform.position.z = z;
  }
  if (e?.health) {
    e.health.current = Math.max(e.health.current, cp.playerHealth);
  }
}
