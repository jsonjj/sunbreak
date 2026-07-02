// Chooses which "brain" answers a turn, in priority order:
//   1. Authored scripted tree  → deterministic, free, offline (canon fallback).
//   2. Registered live provider → the npc-personas client dialogue API (runtime seam).
//   3. Direct HTTP/SSE          → the shared `/api/dialogue/turn` contract.
//
// This is where we CONSUME the npc-personas dialogue API — via the runtime registry
// (`getDialogueProvider`), never a folder import.

import { getDialogueProvider, type Conversable, type DialogueProvider } from "./contract";
import { httpProvider } from "./dialogueClient";
import { hasScriptedTree, scriptedProvider } from "./scripted/trees";

export function resolveProvider(ref: Pick<Conversable, "npcId" | "personaId">): DialogueProvider {
  if (hasScriptedTree(ref)) return scriptedProvider;
  const live = getDialogueProvider();
  if (live) return live;
  return httpProvider;
}
