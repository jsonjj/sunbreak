// ECS helpers for talkable NPCs. Peds/character subsystems (or the integrator) tag an
// entity via `makeTalkable`; dialogue-ui/interaction find targets via `talkableEntities`
// / `findNearestTalkable`; the conversation layer toggles `npc_inConversation` so ambient
// AI can pause its own tick.
import type { Vec3 } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import type { NpcArchetype } from "./types";

/** Live query of every entity that can currently be talked to. */
export const talkableEntities = world.with("npc_talkable");

export interface TalkableOptions {
  displayName?: string;
  faction?: string;
  archetype?: NpcArchetype;
  /** Initial relationship/trust 0..100 (defaults to 50 when read). */
  relationship?: number;
}

/**
 * Mark an (already-in-world) entity as talkable and bind a persona. Uses miniplex
 * add/remove so query membership stays correct; updates values in place when present.
 */
export function makeTalkable(
  entity: ClientEntity,
  personaId?: string,
  opts?: TalkableOptions,
): ClientEntity {
  if (entity.npc_talkable !== true) world.addComponent(entity, "npc_talkable", true);

  if (personaId) {
    if (entity.npc_persona === undefined) world.addComponent(entity, "npc_persona", personaId);
    else entity.npc_persona = personaId;
  }
  if (opts?.archetype) {
    if (entity.npc_archetype === undefined) world.addComponent(entity, "npc_archetype", opts.archetype);
    else entity.npc_archetype = opts.archetype;
  }
  if (opts?.displayName) {
    if (entity.npc_displayName === undefined) world.addComponent(entity, "npc_displayName", opts.displayName);
    else entity.npc_displayName = opts.displayName;
  }
  if (opts?.faction) {
    if (entity.npc_faction === undefined) world.addComponent(entity, "npc_faction", opts.faction);
    else entity.npc_faction = opts.faction;
  }
  if (typeof opts?.relationship === "number") {
    if (entity.npc_relationship === undefined) world.addComponent(entity, "npc_relationship", opts.relationship);
    else entity.npc_relationship = opts.relationship;
  }
  return entity;
}

/** Remove the talkable tag (e.g. NPC despawns or becomes hostile). */
export function clearTalkable(entity: ClientEntity): void {
  if (entity.npc_talkable === true) world.removeComponent(entity, "npc_talkable");
}

/** Set the "busy in a conversation" tag — ambient AI subsystems should gate on this. */
export function setInConversation(entity: ClientEntity): void {
  if (entity.npc_inConversation !== true) world.addComponent(entity, "npc_inConversation", true);
}

/** Clear the "busy" tag when the conversation ends. */
export function clearInConversation(entity: ClientEntity): void {
  if (entity.npc_inConversation === true) world.removeComponent(entity, "npc_inConversation");
}

export function isInConversation(entity: ClientEntity): boolean {
  return entity.npc_inConversation === true;
}

/** Nearest talkable entity within `maxDist` metres of `pos` (proximity trigger helper). */
export function findNearestTalkable(pos: Vec3, maxDist = 4): ClientEntity | undefined {
  let best: ClientEntity | undefined;
  let bestSq = maxDist * maxDist;
  for (const entity of talkableEntities) {
    const p = entity.transform?.position;
    if (!p) continue;
    const dx = p.x - pos.x;
    const dy = p.y - pos.y;
    const dz = p.z - pos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq <= bestSq) {
      bestSq = distSq;
      best = entity;
    }
  }
  return best;
}
