// HTTP surface for the OpenAI gateway. Mounted at `${API_BASE}/ai` (= /api/ai) by index.ts.
//   GET  /api/ai/health            → status/introspection (no throttle)
//   POST /api/ai/dialogue          → SSE stream of AiStreamEvent (the primary route)
//   POST /api/ai/content           → JSON content-gen ({ kind } in body)
//   POST /api/ai/{mission|sidequest|radio-ad|barks} → same handler, kind inferred from path
// The rate limiter guards the generative routes; validation (zod) runs before any work.

import { Router, type Request, type Response } from "express";
import { config, isOffline } from "./config";
import { budgetSnapshot } from "./budget";
import { cacheStats } from "./cache";
import { personaIds } from "./personas";
import { createAiRateLimiter } from "./ratelimit";
import { aiService, streamDialogue } from "./service";
import { contentRequestSchema, dialogueRequestSchema } from "./validation";
import type { AiContentKind } from "./types";

const SERVICE_VERSION = 1;

export function createAiRouter(): Router {
  const router = Router();
  const limiter = createAiRateLimiter();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "ai/openai-service",
      version: SERVICE_VERSION,
      offline: isOffline(),
      hasKey: config.hasKey,
      model: config.model,
      smartModel: config.smartModel,
      maxOutputTokens: config.maxOutputTokens,
      categories: ["npc_dialogue", "ambient_bark", "mission_brief", "tutorial", "radio_dj"],
      contentKinds: ["mission", "sidequest", "radio_ad", "bark"],
      personas: personaIds,
      budget: budgetSnapshot(),
      cache: cacheStats(),
    });
  });

  router.post("/dialogue", limiter, async (req: Request, res: Response) => {
    const parsed = dialogueRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    try {
      await streamDialogue(parsed.data, res, req);
    } catch {
      if (!res.headersSent) res.status(500).json({ ok: false, error: "internal_error" });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  const handleContent = async (
    kind: AiContentKind | undefined,
    req: Request,
    res: Response,
  ): Promise<void> => {
    const raw: unknown = req.body ?? {};
    const body = kind && typeof raw === "object" && raw !== null ? { ...raw, kind } : raw;
    const parsed = contentRequestSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await aiService.generateContent(parsed.data);
      res.json(result);
    } catch {
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  };

  router.post("/content", limiter, (req: Request, res: Response) => {
    void handleContent(undefined, req, res);
  });

  // Path aliases documented by the dynamic-content client (kind inferred from the path).
  const aliases: ReadonlyArray<readonly [string, AiContentKind]> = [
    ["/mission", "mission"],
    ["/sidequest", "sidequest"],
    ["/radio-ad", "radio_ad"],
    ["/barks", "bark"],
  ];
  for (const [path, kind] of aliases) {
    router.post(path, limiter, (req: Request, res: Response) => {
      void handleContent(kind, req, res);
    });
  }

  return router;
}
