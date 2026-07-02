// ─────────────────────────────────────────────────────────────────────────────
// AI content schemas — the CONTRACT every consumer (and the server) shares
// ─────────────────────────────────────────────────────────────────────────────
// Zod is the single source of truth for both the runtime shape (structured-output
// validation) and the TS types. These follow OpenAI structured-output rules:
//   • root is a plain z.object()
//   • prefer `.nullable()` over `.optional()` (structured outputs require every
//     key to be present; absence is expressed as null)
//   • arrays are BOUNDED (`.min`/`.max`) to cap latency + payload size
//   • enums (district/faction/station/brand/…) come straight from canon so a
//     parse failure IS a referential-integrity failure
//
// INTEGRATOR NOTE: these should be promoted to `shared/src/ai/schemas.ts` and
// imported by the server's `zodTextFormat(schema, name)` call so client + server
// validate against the exact same objects. Duplicated here only because this agent
// may not edit `shared/**`.

import { z } from "zod";
import {
  BRANDS,
  DISTRICTS,
  FACTIONS,
  MISSION_TYPES,
  MOODS,
  OBJECTIVE_KINDS,
  SPEAKERS,
  STATIONS,
} from "../canon";

// --- Barks (runtime-hot ambient one-liners) ----------------------------------
export const BarkSchema = z.object({
  text: z.string().min(1).max(120),
  speaker: SPEAKERS.schema,
  tags: z.array(z.string().max(24)).max(4),
});
export type Bark = z.infer<typeof BarkSchema>;

export const BarkPackSchema = z.object({
  context: z.object({
    district: DISTRICTS.schema,
    mood: MOODS.schema,
  }),
  barks: z.array(BarkSchema).min(1).max(24),
});
export type BarkPack = z.infer<typeof BarkPackSchema>;

// --- Radio ad copy -----------------------------------------------------------
export const RadioAdSchema = z.object({
  id: z.string().min(1).max(64),
  brand: BRANDS.schema,
  station: STATIONS.schema,
  lengthSeconds: z.number().int().min(10).max(45),
  script: z.string().min(1).max(900),
  tagline: z.string().min(1).max(120),
  // Fast small-print legal read. Null when the spot has none.
  disclaimer: z.string().max(240).nullable(),
  toneTags: z.array(z.string().max(24)).max(6),
});
export type RadioAd = z.infer<typeof RadioAdSchema>;

// --- Missions (freeroam contracts) -------------------------------------------
export const ObjectiveSchema = z.object({
  id: z.string().min(1).max(48),
  kind: OBJECTIVE_KINDS.schema,
  text: z.string().min(1).max(140),
  // District the objective takes place in; null = "same as / any".
  targetDistrict: DISTRICTS.schema.nullable(),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const GiverSchema = z.object({
  name: z.string().min(1).max(48),
  faction: FACTIONS.schema,
});
export type Giver = z.infer<typeof GiverSchema>;

export const RewardSchema = z.object({
  cash: z.number().int().min(0).max(50000),
  rep: z.number().int().min(0).max(1000),
});
export type Reward = z.infer<typeof RewardSchema>;

export const MissionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  type: MISSION_TYPES.schema,
  district: DISTRICTS.schema,
  giver: GiverSchema,
  hook: z.string().min(1).max(280),
  objectives: z.array(ObjectiveSchema).min(1).max(6),
  reward: RewardSchema,
  failConditions: z.array(z.string().min(1).max(120)).min(1).max(4),
  wantedOnStart: z.number().int().min(0).max(5),
  toneTags: z.array(z.string().max(24)).max(6),
});
export type Mission = z.infer<typeof MissionSchema>;

// --- Side-quests ("strangers" vignettes) -------------------------------------
export const SideQuestSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  district: DISTRICTS.schema,
  character: GiverSchema,
  premise: z.string().min(1).max(400),
  beats: z.array(z.object({ text: z.string().min(1).max(160) })).min(2).max(6),
  reward: RewardSchema,
  toneTags: z.array(z.string().max(24)).max(6),
});
export type SideQuest = z.infer<typeof SideQuestSchema>;

// --- Content-type registry (drives the store, cache keys, and endpoints) ------
export const CONTENT_TYPES = ["barks", "radioAds", "missions", "sidequests"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Maps a content type to the Zod schema of ONE item of that type. */
export const ITEM_SCHEMA = {
  barks: BarkPackSchema,
  radioAds: RadioAdSchema,
  missions: MissionSchema,
  sidequests: SideQuestSchema,
} as const satisfies Record<ContentType, z.ZodTypeAny>;

/** The concrete item type for a given content type. */
export type ItemOf<T extends ContentType> = z.infer<(typeof ITEM_SCHEMA)[T]>;
