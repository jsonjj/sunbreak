// Runtime validation for authored activity content. Keeps the framework data-driven: designers
// author plain objects/JSON in ./data and we validate them here (zod) so a malformed activity
// fails loudly at load instead of corrupting a run.

import { z } from "zod";
import type { ActivityDef } from "./types";

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const rewardSpec = z.object({
  cash: z.number().nonnegative().optional(),
  dirty: z.boolean().optional(),
  skillXp: z.record(z.string(), z.number()).optional(),
  unlockId: z.string().optional(),
});

const rewardTier = z.object({
  label: z.string(),
  minScore: z.number().optional(),
  maxTimeMs: z.number().positive().optional(),
  reward: rewardSpec,
});

const base = {
  id: z.string().min(1),
  name: z.string().min(1),
  region: z.string().optional(),
  origin: vec3,
  markerRadius: z.number().positive().optional(),
  reward: rewardSpec,
  rewardTiers: z.array(rewardTier).optional(),
  cooldownMs: z.number().nonnegative().optional(),
  countdownMs: z.number().nonnegative().optional(),
  timeLimitMs: z.number().positive().optional(),
  blurb: z.string().optional(),
};

const raceSchema = z.object({
  ...base,
  kind: z.literal("race"),
  mode: z.enum(["sprint", "circuit"]),
  laps: z.number().int().positive().optional(),
  requireVehicle: z.boolean().optional(),
  checkpoints: z
    .array(z.object({ pos: vec3, radius: z.number().positive().optional() }))
    .min(2),
});

const rampageSchema = z.object({
  ...base,
  kind: z.literal("rampage"),
  goal: z.number().int().positive(),
  respawn: z.boolean().optional(),
  targets: z
    .array(
      z.object({
        pos: vec3,
        radius: z.number().positive().optional(),
        value: z.number().positive().optional(),
      }),
    )
    .min(1),
});

const deliverySchema = z.object({
  ...base,
  kind: z.literal("delivery"),
  legs: z
    .array(
      z.object({
        pickup: vec3,
        dropoff: vec3,
        radius: z.number().positive().optional(),
        payout: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

export const activityDefSchema = z.discriminatedUnion("kind", [
  raceSchema,
  rampageSchema,
  deliverySchema,
]);

/** Validate + narrow a single raw activity definition. Throws (zod) on invalid content. */
export function parseActivityDef(raw: unknown): ActivityDef {
  return activityDefSchema.parse(raw) as unknown as ActivityDef;
}

/**
 * Validate a batch. Invalid entries are skipped with a console error rather than aborting the
 * whole subsystem — one bad JSON should never take down all activities.
 */
export function parseActivityDefs(raws: readonly unknown[]): ActivityDef[] {
  const out: ActivityDef[] = [];
  for (const raw of raws) {
    const res = activityDefSchema.safeParse(raw);
    if (res.success) {
      out.push(res.data as unknown as ActivityDef);
    } else {
      const id =
        raw && typeof raw === "object" && "id" in raw ? String((raw as { id: unknown }).id) : "?";
      console.error(`[activities] invalid activity def "${id}":`, res.error.issues);
    }
  }
  return out;
}
