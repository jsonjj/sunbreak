// Imperative (non-React) helpers for content/subsystems that manage their own ECS entities.
// The React `<Interactable>` wrapper is built on top of these.

import { identityTransform, type Vec3Tuple } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { InteractVerbConfig } from "./types";
import { useInteractionStore } from "./store";
import { getFocusedEntity, resolveId, setFocusedEntity } from "./runtime";

/**
 * Attach an `interact_` component to an existing entity, making it interactable. Returns a
 * disposer that removes the component and cleans up any focus/range state.
 */
export function markInteractable<D>(
  entity: ClientEntity,
  config: InteractVerbConfig<D>,
): () => void {
  world.addComponent(entity, "interact_", config as InteractVerbConfig);
  return () => unmarkInteractable(entity);
}

/** Remove interactability from an entity and clear any lingering focus/range/tags. */
export function unmarkInteractable(entity: ClientEntity): void {
  const id = resolveId(entity);
  useInteractionStore.getState().removeInRange(id);
  if (getFocusedEntity() === entity) {
    setFocusedEntity(null);
    useInteractionStore.getState().setFocus(null, null);
  }
  if (entity.interact_focused) world.removeComponent(entity, "interact_focused");
  if (entity.interact_inRange) world.removeComponent(entity, "interact_inRange");
  if (entity.interact_) world.removeComponent(entity, "interact_");
}

/**
 * Spawn a standalone interactable entity at a fixed position (handy for pickups / world props that
 * don't otherwise need an entity). Returns the created entity — remove it with `world.remove`.
 */
export function spawnInteractable<D>(
  config: InteractVerbConfig<D>,
  position: Vec3Tuple,
): ClientEntity {
  const transform = identityTransform();
  transform.position = { x: position[0], y: position[1], z: position[2] };
  const entity: ClientEntity = {
    interact_: config as InteractVerbConfig,
    transform,
    isActive: true,
  };
  world.add(entity);
  return entity;
}
