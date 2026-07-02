// Coarse per-IP throttle for the whole /api/ai router (defense-in-depth in front of the
// per-session RPM + USD budgets). Limit comes from env (AI_RATE_LIMIT_PER_MIN). Built at boot,
// after config is overlaid from the boot env.

import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { config } from "./config";

export function createAiRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: config.ratePerMin,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { ok: false, error: "rate_limited" },
  });
}
