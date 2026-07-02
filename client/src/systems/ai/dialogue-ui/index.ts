// Subsystem: ai/dialogue-ui (client) — in-game conversation UI.
//
// Self-registers a proximity/interact system (the "Press E to talk" flow) into the
// client SystemRegistry at module top level, per the Wave-2 auto-registration contract
// (systems-loader eager-imports this index for its side effect). The React DOM overlay
// is EXPORTED (not mounted here) for the integrator to place beside <Canvas>.
//
// Everything else this subsystem needs lives in this folder; cross-subsystem coupling is
// only via (a) the shared ECS `dlg_conversable` component, (b) the shared UI
// `contextPrompt` slice, (c) the shared Input action, (d) the shared game `phase`, and
// (e) the runtime dialogue-provider registry (npc-personas / OpenAI service).

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./components"; // ECS declaration-merge (dlg_conversable / dlg_inConversation)
import { proximitySystem } from "./proximity";
import { useDialogueStore } from "./store";
import { useUiStore } from "@/stores/ui.store";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "ai/dialogue-ui",
  systems: [proximitySystem],
  init() {
    // On teardown (HMR / unmount): abort any live turn + clear the prompt.
    return () => {
      useDialogueStore.getState().close("aborted");
      useUiStore.getState().setContextPrompt(null);
    };
  },
};

registerModule(mod); // required side effect

// ── Integrator surface ──────────────────────────────────────────────────────────
// Mount the overlay once as a DOM sibling of <Canvas> (see wiring notes in the report).
export { DialogueOverlay } from "./ui/DialogueOverlay";

// Imperative + observer API for Missions/Narrative, Audio, HUD.
export { DialogueController } from "./controller";
export type { DialogueControllerApi } from "./controller";

// Store (for advanced consumers / tests / HUD prompt mirroring).
export { useDialogueStore } from "./store";
export type {
  DialogueStatus,
  StartOptions,
  NearbyConversable,
  HistoryLine,
  ActiveSubtitle,
} from "./store";

// Cross-subsystem wiring: npc-personas (or the integrator) registers the live brain here.
export { registerDialogueProvider, getDialogueProvider } from "./contract";
export type {
  Conversable,
  DialogueProvider,
  DialogueEvent,
  DialogueTurnRequest,
  DialogueChoice,
  DialogueMode,
  SpeakerMeta,
} from "./contract";

// Contract validators (shared with the server dialogue route).
export { dialogueEventSchema, dialogueTurnRequestSchema, makePlayerTextSchema } from "./contract";
