// Builds the InteractionContext handed to handler `getPrompt` / `onInteract`.

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { InteractionActionSlot, InteractionContext, PlayerRef } from "./types";
import { interactionEvents } from "./events";
import { getRapier } from "./runtime";

export function makeContext(
  entity: ClientEntity,
  player: PlayerRef,
  distance: number,
  action: InteractionActionSlot,
  now: number,
): InteractionContext {
  return {
    entity,
    config: entity.interact_!,
    player,
    distance,
    action,
    now,
    world,
    rapier: getRapier(),
    events: interactionEvents,
  };
}
