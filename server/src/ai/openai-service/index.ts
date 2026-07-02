// STUB — implement in Wave 2 per gta6-build/04-ai/openai-service.md
// Subsystem: ai/openai-service (server) — OpenAI proxy route, cache, rate limits. The key
// stays server-side (server/.env) and NEVER reaches the client bundle.
import type { SubsystemModule } from "@sunbreak/shared";

export const openaiService: SubsystemModule = {
  id: "ai/openai-service",
};
