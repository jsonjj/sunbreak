// content/data-format — NPC archetype schema.
//
// Consumed by AI/Peds (behavior + spawn rules), AI/Dialogue (`dialogueSetId` → OpenAI persona),
// and Missions (`giver`). Only `id` and `archetype` are required.
import { z } from "zod";
import { AssetRef, Id, withEnvelope } from "./primitives";

export const NpcArchetype = z.enum([
  "civilian",
  "cop",
  "gang",
  "vendor",
  "story",
  "medic",
  "firefighter",
  "military",
]);
export type NpcArchetype = z.infer<typeof NpcArchetype>;

export const NpcBehavior = z.enum([
  "wander",
  "patrol",
  "vendor",
  "missionGiver",
  "aggressive",
  "flee",
  "guard",
  "idle",
]);
export type NpcBehavior = z.infer<typeof NpcBehavior>;

export const TimeOfDay = z.enum(["any", "morning", "day", "evening", "night"]);
export type TimeOfDay = z.infer<typeof TimeOfDay>;

/** An NPC archetype definition. `schema: "sunbreak.npc"`. */
export const Npc = withEnvelope("sunbreak.npc", {
  name: z.string().optional(),
  archetype: NpcArchetype,
  model: AssetRef.optional(),
  /** Alternate skin/material variants (model refs or material ids). */
  skins: z.array(z.string()).default([]),
  animSet: z.string().optional(),
  factionId: Id.optional(),
  /** 0 = passive, 1 = always hostile. */
  hostility: z.number().min(0).max(1).default(0),
  health: z.number().positive().default(100),
  behavior: NpcBehavior.default("wander"),
  loadout: z
    .object({
      weaponId: Id.optional(),
      items: z.array(Id).default([]),
    })
    .passthrough()
    .default({}),
  /** Links to an AI-dialogue persona/prompt set (resolved server-side). */
  dialogueSetId: z.string().optional(),
  spawn: z
    .object({
      districts: z.array(Id).default([]),
      timeOfDay: z.array(TimeOfDay).default(["any"]),
      densityWeight: z.number().nonnegative().default(1),
    })
    .passthrough()
    .default({}),
  tags: z.array(z.string()).default([]),
});
export type Npc = z.infer<typeof Npc>;
