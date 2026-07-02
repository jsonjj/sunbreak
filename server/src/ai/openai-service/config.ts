// Typed configuration for the OpenAI gateway.
//
// The OpenAI key + primary model come from the boot `env` (server/src/env.ts, passed to the
// boot hook) so we honor the single source of truth and NEVER touch env.ts ourselves. Extra
// knobs that env.ts does not (yet) declare are read here from process.env with zod defaults —
// dotenv is already loaded by env.ts before subsystems import, so process.env is populated.
//
// Everything here is server-side only. The key is never serialized into any response.

import { z } from "zod";
import type { env as serverEnv } from "../../env";

/** Booleans in env are strings; treat "1"/"true"/"yes"/"on" as true. */
const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : /^(1|true|yes|on)$/i.test(v)));

const num = (def: number, min = 0) =>
  z.coerce.number().min(min).optional().transform((v) => (v === undefined || Number.isNaN(v) ? def : v));

const Extra = z.object({
  OPENAI_SMART_MODEL: z.string().min(1).optional(),
  AI_SESSION_DAILY_USD: num(0.25),
  AI_GLOBAL_DAILY_USD: num(5.0),
  AI_SESSION_RPM: num(20, 1),
  AI_MAX_OUTPUT_TOKENS: num(200, 1),
  AI_TEMPERATURE: num(0.8),
  AI_OFFLINE: boolish(false),
  AI_MODERATION: boolish(true),
  AI_CACHE_MAX: num(500, 1),
  AI_CACHE_TTL_MS: num(15 * 60_000, 1000),
  AI_REQUEST_TIMEOUT_MS: num(15_000, 1000),
  // Optional flat price overrides (USD per 1M tokens); otherwise the cost table is used.
  AI_PRICE_INPUT_PER_M: z.coerce.number().optional(),
  AI_PRICE_OUTPUT_PER_M: z.coerce.number().optional(),
});

const extra = Extra.parse(process.env);

export interface AiConfig {
  nodeEnv: string;
  apiKey: string;
  hasKey: boolean;
  /** Operator forced offline via AI_OFFLINE=1 (independent of key presence). */
  forcedOffline: boolean;
  model: string;
  smartModel: string;
  maxOutputTokens: number;
  temperature: number;
  sessionDailyUsd: number;
  globalDailyUsd: number;
  sessionRpm: number;
  ratePerMin: number;
  cacheMax: number;
  cacheTtlMs: number;
  requestTimeoutMs: number;
  moderationEnabled: boolean;
  priceInputPerM: number | undefined;
  priceOutputPerM: number | undefined;
}

/**
 * Live config. `apiKey`/`model`/`ratePerMin` are seeded from process.env at import (safe
 * defaults so import-time code never crashes) and then AUTHORITATIVELY overwritten from the
 * boot `env` in `configureFromBootEnv` before any route can fire.
 */
export const config: AiConfig = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiKey: process.env.OPENAI_API_KEY ?? "",
  hasKey: (process.env.OPENAI_API_KEY ?? "").trim().length > 0,
  forcedOffline: extra.AI_OFFLINE,
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  smartModel: extra.OPENAI_SMART_MODEL ?? "gpt-4o",
  maxOutputTokens: extra.AI_MAX_OUTPUT_TOKENS,
  temperature: extra.AI_TEMPERATURE,
  sessionDailyUsd: extra.AI_SESSION_DAILY_USD,
  globalDailyUsd: extra.AI_GLOBAL_DAILY_USD,
  sessionRpm: extra.AI_SESSION_RPM,
  ratePerMin: Number(process.env.AI_RATE_LIMIT_PER_MIN ?? 20) || 20,
  cacheMax: extra.AI_CACHE_MAX,
  cacheTtlMs: extra.AI_CACHE_TTL_MS,
  requestTimeoutMs: extra.AI_REQUEST_TIMEOUT_MS,
  moderationEnabled: extra.AI_MODERATION,
  priceInputPerM: extra.AI_PRICE_INPUT_PER_M,
  priceOutputPerM: extra.AI_PRICE_OUTPUT_PER_M,
};

/**
 * Overlay the authoritative, zod-validated boot env onto the config. Called once from the boot
 * hook. This is where "read the key from `env`" is honored literally.
 */
export function configureFromBootEnv(env: typeof serverEnv): void {
  config.nodeEnv = env.NODE_ENV;
  config.apiKey = (env.OPENAI_API_KEY ?? "").trim();
  config.hasKey = config.apiKey.length > 0;
  config.model = env.OPENAI_MODEL || config.model;
  config.ratePerMin = env.AI_RATE_LIMIT_PER_MIN || config.ratePerMin;
  // Keep the per-session RPM no looser than the coarse per-IP limit unless explicitly raised.
  if (!process.env.AI_SESSION_RPM) config.sessionRpm = config.ratePerMin;
}

/** True when we must NOT call OpenAI (no key or operator-forced offline). */
export function isOffline(): boolean {
  return config.forcedOffline || !config.hasKey;
}
