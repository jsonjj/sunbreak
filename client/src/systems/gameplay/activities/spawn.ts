// ECS spawn/despawn helpers for transient objective nodes. Nodes are real sim entities carrying
// `act_node` + `transform`, so a render subsystem can later visualize them through the ECS↔R3F
// bridge (checkpoint rings, target props, delivery markers) without any hand-mounting here.

import type { Vec3Tuple } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { ActivityNodeData } from "./types";

/** Query over all activity nodes (created once, iterated per frame). */
export const activityNodes = world.with("act_node", "transform");

export function spawnNode(data: ActivityNodeData, pos: Vec3Tuple, armed: boolean): ClientEntity {
  const entity: ClientEntity = {
    act_node: data,
    isActive: true,
    transform: {
      position: { x: pos[0], y: pos[1], z: pos[2] },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };
  if (armed) entity.act_armed = true;
  world.add(entity);
  return entity;
}

export function armNode(entity: ClientEntity, on: boolean): void {
  if (on) {
    if (!entity.act_armed) world.addComponent(entity, "act_armed", true);
  } else if (entity.act_armed) {
    world.removeComponent(entity, "act_armed");
  }
}

export function markCleared(entity: ClientEntity): void {
  if (!entity.act_cleared) world.addComponent(entity, "act_cleared", true);
  armNode(entity, false);
}

export function despawnNode(entity: ClientEntity): void {
  if (world.has(entity)) world.remove(entity);
}

/** Safety net: remove any lingering nodes for a run id. */
export function despawnRunNodes(runId: string): void {
  for (const e of [...activityNodes]) {
    if (e.act_node?.runId === runId) world.remove(e);
  }
}
