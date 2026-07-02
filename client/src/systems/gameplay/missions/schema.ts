// Mission data format — the designer-authored contract.
//
// This is the SINGLE SOURCE OF TRUTH for mission shapes: the Zod schemas below validate
// the JSON files in `./data/*.mission.json` at load time, and every TypeScript type is
// derived from them via `z.infer` so the runtime and the data can never drift.
//
// Kept entirely inside this subsystem folder (the WAVE-2 protocol forbids touching
// `shared/**`). If the v4 server ever needs to validate co-op objective state, this module
// can be lifted verbatim into shared.

import { z } from "zod";

/** World position, ground-plane tuple `[x, y, z]` (matches the mission-system spec). */
export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof vec3Schema>;

export const markerSpecSchema = z.object({
  color: z.string().optional(),
  label: z.string().optional(),
  /** Draw a GPS waypoint (route arrow + distance) rather than a plain objective blip. */
  waypoint: z.boolean().optional(),
  /** Emit a minimap blip (default true). */
  blip: z.boolean().optional(),
});
export type MarkerSpec = z.infer<typeof markerSpecSchema>;

export const timerSpecSchema = z.object({
  id: z.string().optional(),
  seconds: z.number().positive(),
  onExpire: z.enum(["fail", "advance", "event"]),
  hud: z.boolean().optional(),
});
export type TimerSpec = z.infer<typeof timerSpecSchema>;

export const medalRuleSchema = z.object({
  medal: z.enum(["bronze", "silver", "verano_gold"]),
  /** All of these `medalTag`s must have been collected during the run. */
  requires: z.array(z.string()).optional(),
  underSeconds: z.number().positive().optional(),
  minAccuracy: z.number().min(0).max(1).optional(),
});
export type MedalRule = z.infer<typeof medalRuleSchema>;

const objectiveBase = { id: z.string(), label: z.string() };

export const objectiveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("goto"),
    ...objectiveBase,
    position: vec3Schema,
    radius: z.number().positive(),
    inVehicle: z.boolean().optional(),
    marker: markerSpecSchema.optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("eliminate"),
    ...objectiveBase,
    // Either a list of spawn refs, or a single `{ spawnRef }` group.
    targets: z.union([z.array(z.string()).min(1), z.object({ spawnRef: z.string() })]),
    count: z.number().int().positive().optional(),
    marker: markerSpecSchema.optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("enterVehicle"),
    ...objectiveBase,
    vehicleRef: z.string(),
    marker: markerSpecSchema.optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("protect"),
    ...objectiveBase,
    entityRef: z.string(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("survive"),
    ...objectiveBase,
    seconds: z.number().positive(),
    marker: markerSpecSchema.optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("escape"),
    ...objectiveBase,
    position: vec3Schema,
    radius: z.number().positive(),
    inVehicle: z.boolean().optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("interact"),
    ...objectiveBase,
    targetId: z.string(),
    position: vec3Schema.optional(),
    radius: z.number().positive().optional(),
    marker: markerSpecSchema.optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("collect"),
    ...objectiveBase,
    itemRef: z.string(),
    position: vec3Schema.optional(),
    radius: z.number().positive().optional(),
    count: z.number().int().positive().optional(),
    marker: markerSpecSchema.optional(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("wait"),
    ...objectiveBase,
    seconds: z.number().positive(),
  }),
  z.object({
    kind: z.literal("custom"),
    ...objectiveBase,
    predicateId: z.string(),
    medalTag: z.string().optional(),
    optional: z.boolean().optional(),
  }),
]);
export type Objective = z.infer<typeof objectiveSchema>;
export type ObjectiveKind = Objective["kind"];

export const triggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enterArea"), position: vec3Schema, radius: z.number().positive() }),
  z.object({
    kind: z.literal("interact"),
    targetId: z.string(),
    position: vec3Schema.optional(),
    radius: z.number().positive().optional(),
  }),
  z.object({ kind: z.literal("phoneCall"), contactId: z.string() }),
  z.object({ kind: z.literal("missionComplete"), missionId: z.string() }),
  z.object({ kind: z.literal("manual") }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("spawnEnemies"),
    ref: z.string(),
    archetype: z.string(),
    position: vec3Schema,
    count: z.number().int().positive(),
    radius: z.number().nonnegative().optional(),
    weapon: z.string().optional(),
    behavior: z.enum(["guard", "patrol", "attack"]).optional(),
    health: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal("spawnVehicle"),
    ref: z.string(),
    model: z.string(),
    position: vec3Schema,
    heading: z.number().optional(),
    occupied: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("spawnProp"), ref: z.string(), model: z.string(), position: vec3Schema }),
  z.object({ kind: z.literal("despawn"), ref: z.string() }),
  z.object({ kind: z.literal("setWanted"), stars: z.number().int().min(0).max(5) }),
  z.object({
    kind: z.literal("dialogue"),
    speaker: z.string(),
    line: z.string().optional(),
    // Routed through the server OpenAI proxy in v3; ignored client-side today.
    aiPrompt: z.string().optional(),
  }),
  z.object({ kind: z.literal("cutscene"), id: z.string() }),
  z.object({
    kind: z.literal("setObjectiveMarker"),
    position: vec3Schema,
    label: z.string().optional(),
    color: z.string().optional(),
    waypoint: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("giveWeapon"), weaponId: z.string() }),
  z.object({ kind: z.literal("playSound"), soundId: z.string() }),
  z.object({ kind: z.literal("custom"), id: z.string(), args: z.record(z.string(), z.unknown()).optional() }),
]);
export type Action = z.infer<typeof actionSchema>;

export const failStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("playerDied") }),
  z.object({ kind: z.literal("protectedDied"), entityRef: z.string() }),
  z.object({ kind: z.literal("vehicleDestroyed"), entityRef: z.string() }),
  z.object({ kind: z.literal("timerExpired"), timerId: z.string().optional() }),
  z.object({ kind: z.literal("leftArea"), position: vec3Schema, radius: z.number().positive() }),
  z.object({ kind: z.literal("wantedAtLeast"), stars: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal("predicate"), id: z.string() }),
]);
export type FailState = z.infer<typeof failStateSchema>;

export const rewardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cash"), amount: z.number() }),
  z.object({ kind: z.literal("rep"), amount: z.number() }),
  z.object({ kind: z.literal("item"), itemId: z.string(), qty: z.number().int().positive().optional() }),
  z.object({ kind: z.literal("weapon"), weaponId: z.string() }),
  z.object({ kind: z.literal("unlockMission"), missionId: z.string() }),
  z.object({ kind: z.literal("unlockBusiness"), businessId: z.string() }),
]);
export type Reward = z.infer<typeof rewardSchema>;

export const stageSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  onEnter: z.array(actionSchema).optional(),
  objectives: z.array(objectiveSchema).min(1),
  /** One objective at a time (default true) vs. all-at-once. */
  sequence: z.boolean().optional(),
  /** Snapshot the player on entry; failure restarts here instead of aborting. */
  checkpoint: z.boolean().optional(),
  timer: timerSpecSchema.optional(),
  failStates: z.array(failStateSchema).optional(),
  onComplete: z.array(actionSchema).optional(),
});
export type Stage = z.infer<typeof stageSchema>;

export const missionArchetypeSchema = z.enum([
  "heist",
  "chase",
  "stealth",
  "siege",
  "solo",
  "deal_gone_wrong",
  "recon",
]);
export type MissionArchetype = z.infer<typeof missionArchetypeSchema>;

export const missionDefSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    archetype: missionArchetypeSchema,
    giver: z.string().optional(),
    prerequisites: z.array(z.string()).optional(),
    startTrigger: triggerSchema,
    stages: z.array(stageSchema).min(1),
    rewards: z.array(rewardSchema).default([]),
    medals: z.array(medalRuleSchema).optional(),
    /** Mission-wide fail states (checked in every stage). */
    failStates: z.array(failStateSchema).optional(),
    /** Actions run once when the mission ends (despawn strays, reset world). */
    onCleanup: z.array(actionSchema).optional(),
    /** Whether the mission can be replayed from mission-select (default true). */
    replayable: z.boolean().optional(),
  })
  .strict();
export type MissionDef = z.infer<typeof missionDefSchema>;

/** Throws a `ZodError` with readable issues if the JSON is malformed. */
export function parseMission(json: unknown): MissionDef {
  return missionDefSchema.parse(json);
}

/** Non-throwing variant used by the registry so one bad file never crashes load. */
export function safeParseMission(json: unknown) {
  return missionDefSchema.safeParse(json);
}
