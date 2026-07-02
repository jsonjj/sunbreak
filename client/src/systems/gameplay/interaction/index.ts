// Subsystem: gameplay/interaction (client) — the generic "what can I do here right now?" layer.
// Detects the nearest interactable (entities carrying an `interact_` component), arbitrates focus,
// publishes a contextual prompt to the shared interaction store, and dispatches the chosen handler.
//
// Self-registers on import (the systems-loader eager-imports this file). Everything else in this
// subsystem is pulled in through here — nothing else is auto-loaded.
//
// See gta6-build/03-gameplay/interaction-system.md for the design; this build keeps ALL of it in
// this one owned folder (types live here, not in shared) and drives detection off the ECS.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./interaction.components"; // ECS `interact_` augmentation (declaration merging)
import { registerBuiltinHandlers } from "./handlers";
import { focusSystem } from "./focus";
import { dispatchSystem } from "./input";
import { useInteractionStore } from "./store";

type W = typeof world;

export const interaction: SubsystemModule<W> = {
  id: "gameplay/interaction",
  systems: [focusSystem, dispatchSystem],
  init() {
    registerBuiltinHandlers();
    return () => {
      useInteractionStore.getState().reset();
    };
  },
};

registerModule(interaction);
export { interaction as mod };

// ── Public API (other subsystems + the integrator build on these) ───────────────────────────────
export * from "./types";
export * from "./constants";
export * from "./registry";
export * from "./events";
export { useInteractionStore } from "./store";
export type { InteractionStoreState } from "./store";
export { markInteractable, unmarkInteractable, spawnInteractable } from "./api";
export { Interactable } from "./Interactable";
export type { InteractableProps } from "./Interactable";
export { InteractionRig } from "./InteractionRig";
export { InteractionPrompt } from "./InteractionPrompt";
export { WorldPromptMarker } from "./WorldPromptMarker";

// Built-in handlers + their data payload shapes (for authoring `interact_.data`).
export * from "./handlers/vehicleEnter";
export * from "./handlers/door";
export * from "./handlers/itemPickup";
export * from "./handlers/npcTalk";
export * from "./handlers/shopBuy";
