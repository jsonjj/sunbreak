// ─────────────────────────────────────────────────────────────────────────────
// ai/dynamic-content (client) — AI-generated missions / barks / radio ad copy
// ─────────────────────────────────────────────────────────────────────────────
// Self-registers on import (the systems-loader eagerly imports this root index).
// v1 delivery: shared Zod schemas + canon + content-pack loader + hand-authored
// fallback packs + client store/hooks + a bark director, so the world has content
// with NO API key, NO server, and NO network. Runtime generation via the server AI
// routes is strictly opt-in and only ever refills pools in the background.
//
// Contract with the server (owned by server/src/ai/**, NOT this agent): see
// ./contract/endpoints.ts. The OPENAI_API_KEY is never touched client-side.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./dynamic-content.components"; // ECS augmentation (dyn_*) — type-only side effect
import { dynSystems } from "./bark-director";
import { bootstrap } from "./bootstrap";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "ai/dynamic-content",
  systems: dynSystems,
  init: bootstrap,
};

registerModule(mod); // required side effect

// --- Public API (consumers import from "@/systems/ai/dynamic-content") --------
export * from "./canon";
export * from "./contract/schemas";
export * from "./contract/endpoints";
export * from "./contract/content-keys";
export * from "./content-client";
export * from "./useDynamicContent";
export {
  useContentStore,
  deriveMood,
  barkPoolSize,
  DEFAULT_BARK_CONTEXT,
  type BarkContext,
  type LoadSource,
} from "./contentStore";
export { DynamicContentDebugPanel, type DebugPanelProps } from "./DebugPanel";
export { authoredContent, type AuthoredContent } from "./packs";
