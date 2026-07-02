// Interaction port — how the player triggers an activity from the world.
//
// PRIMARY (when Interaction lands): the integrator injects an adapter whose register() calls the
// Interaction API (registerInteractable + registerHandler for kind "activity_start"). Such an
// adapter reports `local: false`, so this subsystem stops running its own proximity/prompt loop
// and lets Interaction own focus arbitration + the prompt HUD.
//
// FALLBACK (default, works today): `local: true`. The ActivityManager runs a cheap, throttled
// proximity scan over registered entries, drives useUiStore.contextPrompt, and dispatches
// onInteract on the interact key. This matches the distance-query fallback the Interaction spec
// itself sanctions.

import type { Vec3 } from "@sunbreak/shared";

export interface InteractionEntry {
  id: string;
  /** Verb/kind for a real Interaction handler, e.g. "activity_start". */
  kind: string;
  getPosition: () => Vec3;
  range: number;
  /** Prompt text, or null to hide/disable (e.g. on cooldown or a run is active). */
  getPrompt: () => string | null;
  onInteract: () => void;
}

export interface InteractionPort {
  /** true → ActivityManager runs the local proximity/prompt/key loop over entries(). */
  readonly local: boolean;
  register(entry: InteractionEntry): () => void;
  entries(): InteractionEntry[];
}

export function createLocalInteractionPort(): InteractionPort {
  const map = new Map<string, InteractionEntry>();
  return {
    local: true,
    register(entry) {
      map.set(entry.id, entry);
      return () => {
        map.delete(entry.id);
      };
    },
    entries() {
      return Array.from(map.values());
    },
  };
}
