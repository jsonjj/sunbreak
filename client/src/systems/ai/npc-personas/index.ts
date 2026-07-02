// Subsystem: ai/npc-personas (client) — the NPC "brain": persona/character-card data,
// short-term conversation memory, live world-state injection, an SSE dialogue client for
// the shared server contract (POST /api/ai/dialogue), and an always-available offline
// canned-line fallback. Exposes `startConversation(entity)` for the dialogue-ui.
//
// Self-registers on import (the systems-loader eager-imports this file). The OpenAI key
// and SDK are SERVER-ONLY and never touched here.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./npc.components"; // ECS augmentation (npc_* fields)
import { MEMORY_SWEEP_MS } from "./config";
import { memory } from "./memory";
import { loadPersonaRegistry } from "./personaRegistry";
import { npcPersonaSystem } from "./system";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "ai/npc-personas",
  systems: [npcPersonaSystem],
  init() {
    // Validate persona cards fail-safe (logs + continues) and start the memory sweeper.
    loadPersonaRegistry();
    const timer = setInterval(() => memory.sweep(), MEMORY_SWEEP_MS);
    return () => clearInterval(timer);
  },
};

registerModule(mod); // required self-registration side effect

/** Back-compat alias for the previous stub export name. */
export const npcPersonas = mod;

// Public API consumed by dialogue-ui and sibling subsystems.
export * from "./api";
