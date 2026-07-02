// ─────────────────────────────────────────────────────────────────────────────
// Server AI endpoint contract (the shape THIS client expects the server to expose)
// ─────────────────────────────────────────────────────────────────────────────
// The client NEVER talks to OpenAI. It talks to these server routes, which are the
// only place the OPENAI_API_KEY is ever read. Everything here is optional at
// runtime: if the server is absent, disabled, or key-less, the client falls back
// to bundled static packs (see ../packs) and the game runs fully offline / $0.
//
// INTEGRATOR NOTE — server side (owned by `server/src/ai/**`, NOT this agent):
//   GET  /api/ai/status         -> AiStatus         (cheap, unauthenticated)
//   GET  /api/ai/content-packs  -> ContentPacks     (authored + committed generated)
//   POST /api/ai/barks          <- BarkRequest      -> BarkPack       (opt-in)
//   POST /api/ai/mission        <- MissionRequest   -> Mission        (opt-in)
//   POST /api/ai/sidequest      <- SideQuestRequest -> SideQuest      (opt-in)
//   POST /api/ai/radio-ad       <- RadioAdRequest   -> RadioAd        (opt-in)
// POST routes must be guarded server-side by express-rate-limit + the budget guard
// + SQLite cache, and should 404/503 unless a key is present and AI_RUNTIME_ENABLED.

import { z } from "zod";
import { API_BASE } from "@sunbreak/shared";
import { DISTRICTS, FACTIONS, MISSION_TYPES, MOODS, STATIONS, BRANDS } from "../canon";
import {
  BarkPackSchema,
  MissionSchema,
  RadioAdSchema,
  SideQuestSchema,
} from "./schemas";

/** All AI routes live under this prefix; the Vite dev proxy forwards it to :8787. */
export const AI_API_BASE = `${API_BASE}/ai`;

export const endpointUrl = (path: string): string => `${AI_API_BASE}${path}`;

// --- GET /api/ai/status ------------------------------------------------------
export const AiStatusSchema = z.object({
  /** True only when a key is present AND the server kill-switch is on. */
  runtimeEnabled: z.boolean(),
  hasKey: z.boolean(),
  /** Model routing the server will actually use, per content type. */
  models: z.record(z.string()),
  budget: z
    .object({
      dailyTokenBudget: z.number(),
      tokensUsedToday: z.number(),
      usdSpentToday: z.number(),
    })
    .nullable(),
  schemaVersion: z.string(),
  promptVersion: z.string(),
});
export type AiStatus = z.infer<typeof AiStatusSchema>;

// --- GET /api/ai/content-packs ----------------------------------------------
export const ContentPacksSchema = z.object({
  schemaVersion: z.string(),
  promptVersion: z.string(),
  barks: z.array(BarkPackSchema),
  radioAds: z.array(RadioAdSchema),
  missions: z.array(MissionSchema),
  sidequests: z.array(SideQuestSchema),
});
export type ContentPacksResponse = z.infer<typeof ContentPacksSchema>;

// --- Request bodies for the opt-in POST routes -------------------------------
export const BarkRequestSchema = z.object({
  district: DISTRICTS.schema,
  mood: MOODS.schema,
  count: z.number().int().min(1).max(24).optional(),
  seed: z.string().max(64).optional(),
});
export type BarkRequest = z.infer<typeof BarkRequestSchema>;

export const MissionRequestSchema = z.object({
  district: DISTRICTS.schema,
  type: MISSION_TYPES.schema.optional(),
  giverFaction: FACTIONS.schema.optional(),
  wanted: z.number().int().min(0).max(5).optional(),
  seed: z.string().max(64).optional(),
});
export type MissionRequest = z.infer<typeof MissionRequestSchema>;

export const SideQuestRequestSchema = z.object({
  district: DISTRICTS.schema,
  seed: z.string().max(64).optional(),
});
export type SideQuestRequest = z.infer<typeof SideQuestRequestSchema>;

export const RadioAdRequestSchema = z.object({
  station: STATIONS.schema,
  brand: BRANDS.schema.optional(),
  seed: z.string().max(64).optional(),
});
export type RadioAdRequest = z.infer<typeof RadioAdRequestSchema>;

/** Descriptor for each opt-in generation route: path + request/response schemas.
 *  Consumed by ../content-client.ts so request/response validation is centralised. */
export const GENERATE_ENDPOINTS = {
  barks: { path: "/barks", request: BarkRequestSchema, response: BarkPackSchema },
  mission: { path: "/mission", request: MissionRequestSchema, response: MissionSchema },
  sidequest: {
    path: "/sidequest",
    request: SideQuestRequestSchema,
    response: SideQuestSchema,
  },
  radioAd: { path: "/radio-ad", request: RadioAdRequestSchema, response: RadioAdSchema },
} as const;

export type GenerateEndpointName = keyof typeof GENERATE_ENDPOINTS;

export const STATUS_PATH = "/status";
export const CONTENT_PACKS_PATH = "/content-packs";
