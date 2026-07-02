import { createEmptyPlayerInput, type Vec3Tuple } from "@sunbreak/shared";
import { world } from "../ecs/world";
import type { ClientEntity } from "../ecs/clientEntity";

/** Spawn the local player entity (sim components + tags). The physics body handle is attached
 *  later by <PlayerController> via world.addComponent. */
export function spawnLocalPlayer(pos: Vec3Tuple): ClientEntity {
  const entity: ClientEntity = {
    isPlayer: true,
    isLocal: true,
    isActive: true,
    netId: 1,
    transform: {
      position: { x: pos[0], y: pos[1], z: pos[2] },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    velocity: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
    input: createEmptyPlayerInput(),
    movement: { speed: 0, normalizedSpeed: 0, mode: "idle", grounded: false, facing: 0 },
    health: { current: 100, max: 100, armor: 0 },
  };
  world.add(entity);
  return entity;
}

export function removeEntity(entity: ClientEntity): void {
  world.remove(entity);
}
