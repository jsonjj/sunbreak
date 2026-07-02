// content/data-format — mission schema.
//
// Consumed by the Missions runtime (ordered objectives, triggers, medals, rewards, flow) and
// links to NPCs (`giver`) and map POIs. Only `id` and `archetype` are required; `objectives`
// defaults to empty so a mission stub validates while it is being authored.
import { z } from "zod";
import { Id, Vec3, withEnvelope } from "./primitives";

export const MissionArchetype = z.enum([
  "heist",
  "duo",
  "solo",
  "chase",
  "stealth",
  "siege",
  "deal",
  "recon",
  "race",
  "delivery",
  "assassination",
  "defend",
]);
export type MissionArchetype = z.infer<typeof MissionArchetype>;

export const ObjectiveType = z.enum([
  "goto",
  "eliminate",
  "collect",
  "drive",
  "deliver",
  "defend",
  "escape",
  "wait",
  "interact",
  "photograph",
  "survive",
  "custom",
]);
export type ObjectiveType = z.infer<typeof ObjectiveType>;

/** One step in a mission. `target` is intentionally freeform (id string, tuple, or object). */
export const Objective = z
  .object({
    id: Id.optional(),
    type: ObjectiveType,
    label: z.string().optional(),
    target: z.unknown().optional(),
    targetId: Id.optional(),
    pos: Vec3.optional(),
    count: z.number().int().positive().optional(),
    radius: z.number().nonnegative().optional(),
    optional: z.boolean().default(false),
    timeLimit: z.number().positive().optional(),
  })
  .passthrough();
export type Objective = z.infer<typeof Objective>;

/** How a mission (or objective) is triggered. */
export const Trigger = z
  .object({
    type: z.string().default("onFoot"),
    pos: Vec3.optional(),
    radius: z.number().positive().default(3),
  })
  .passthrough();
export type Trigger = z.infer<typeof Trigger>;

/** Medal thresholds. All optional — a mission may award only some tiers. */
export const Medal = z
  .object({
    time: z.number().optional(), // seconds, lower is better
    accuracy: z.number().optional(), // 0..1
    noDamage: z.boolean().optional(),
    headshots: z.number().optional(),
  })
  .passthrough();
export type Medal = z.infer<typeof Medal>;

export const Rewards = z
  .object({
    cash: z.number().default(0),
    xp: z.number().default(0),
    unlocks: z.array(z.string()).default([]),
  })
  .passthrough();
export type Rewards = z.infer<typeof Rewards>;

/** A mission definition. `schema: "sunbreak.mission"`. */
export const Mission = withEnvelope("sunbreak.mission", {
  name: z.string().optional(),
  archetype: MissionArchetype,
  /** NPC id of the mission giver. */
  giver: Id.optional(),
  region: z.string().optional(),
  districtId: Id.optional(),
  prerequisites: z
    .object({
      missionIds: z.array(Id).default([]),
      storyFlags: z.array(z.string()).default([]),
    })
    .passthrough()
    .default({}),
  startTrigger: Trigger.optional(),
  objectives: z.array(Objective).default([]),
  medals: z
    .object({
      bronze: Medal.optional(),
      silver: Medal.optional(),
      gold: Medal.optional(),
    })
    .passthrough()
    .default({}),
  rewards: Rewards.default({}),
  /** Freeform checkpoint markers (tuple positions or objects). */
  checkpoints: z.array(z.unknown()).default([]),
  failConditions: z.array(z.string()).default([]),
  dialogueRefs: z.array(z.string()).default([]),
  /** Next mission id, or several branching ids. */
  next: z.union([Id, z.array(Id)]).optional(),
});
export type Mission = z.infer<typeof Mission>;
