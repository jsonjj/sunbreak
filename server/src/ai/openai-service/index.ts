// Subsystem: ai/openai-service (server) — the single server-side gateway to OpenAI.
//
// Self-registers on import (the kernel systems-loader imports this file automatically). It
// mounts the /api/ai/* routes on the shared Express app via a boot hook and reads the OpenAI
// key from the boot `env` — the key stays server-side and NEVER reaches the client bundle.
// The server boots fine with NO key: every route transparently degrades to canned/offline
// output, so the game is always playable and nothing here can crash the server.

import type { SubsystemModule } from "@sunbreak/shared";
import { API_BASE } from "@sunbreak/shared";
import { registerBoot, registerModule } from "../../kernel/registry";
import { configureFromBootEnv } from "./config";
import { createAiRouter } from "./routes";
import { aiService } from "./service";

export const openaiService: SubsystemModule = {
  id: "ai/openai-service",
};

registerModule(openaiService);

registerBoot(({ app, env }) => {
  // Overlay the authoritative key/model/rate-limit from the validated boot env.
  configureFromBootEnv(env);
  // Mount the whole gateway under /api/ai.
  app.use(`${API_BASE}/ai`, createAiRouter());
});

// ── In-process API for sibling server subsystems (npc-personas, dynamic-content, rooms) ──
// e.g.  import { getAiService } from "../openai-service";
export { aiService };
export function getAiService() {
  return aiService;
}

export type {
  AiService,
  AiDialogueRequest,
  AiContentRequest,
  AiContentResponse,
  AiStreamEvent,
  AiCategory,
  AiContentKind,
  AiSource,
  ChatReq,
  ChatRes,
  ChatMessage,
  ModerationResult,
  SpeakerMeta,
  AiUsage,
} from "./types";
