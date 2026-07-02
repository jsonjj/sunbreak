// Edge validation with zod. Request bodies are untrusted (from the browser); content OUTPUT
// schemas re-validate what the model returns so a bad generation never reaches a consumer.

import { z } from "zod";
import type { AiContentKind } from "./types";

const contextSchema = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .optional();

export const categorySchema = z
  .enum(["npc_dialogue", "ambient_bark", "mission_brief", "tutorial", "radio_dj"])
  .default("npc_dialogue");

export const contentKindSchema = z.enum(["mission", "sidequest", "radio_ad", "bark"]);

export const dialogueRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  category: categorySchema,
  npcId: z.string().max(64).optional(),
  personaId: z.string().max(64).optional(),
  conversationId: z.string().max(128).optional(),
  playerText: z.string().max(500).optional(),
  choiceId: z.string().max(64).optional(),
  context: contextSchema,
});

export const contentRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  kind: contentKindSchema,
  count: z.coerce.number().int().min(1).max(10).optional(),
  context: contextSchema,
});

// ── Live content-output schemas (kind → zod) ──────────────────────────────────────────

const missionSchema = z.object({
  title: z.string().min(1).max(120),
  giver: z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  summary: z.string().min(1).max(600),
  objectives: z.array(z.string().min(1).max(160)).min(1).max(6),
  reward: z.number().nonnegative().max(1_000_000),
  failConditions: z.array(z.string().min(1).max(160)).max(5).default([]),
});

const sidequestSchema = z.object({
  title: z.string().min(1).max(120),
  character: z.string().min(1).max(80),
  district: z.string().min(1).max(60),
  hook: z.string().min(1).max(400),
  steps: z.array(z.string().min(1).max(160)).min(1).max(6),
  payoff: z.string().min(1).max(300),
});

const radioAdSchema = z.object({
  brand: z.string().min(1).max(80),
  product: z.string().min(1).max(120),
  script: z.string().min(1).max(800),
  tagline: z.string().min(1).max(160),
});

const barkPackSchema = z.object({
  barks: z
    .array(
      z.object({
        text: z.string().min(1).max(120),
        speaker: z.enum(["civilian", "vendor", "tourist", "gangster", "cop"]),
      }),
    )
    .min(1)
    .max(20),
});

export function contentOutputSchema(kind: AiContentKind): z.ZodType {
  switch (kind) {
    case "mission":
      return missionSchema;
    case "sidequest":
      return sidequestSchema;
    case "radio_ad":
      return radioAdSchema;
    case "bark":
      return barkPackSchema;
  }
}
