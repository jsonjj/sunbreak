// Shared HUD store for interaction prompts (zustand). This is the single source the DOM prompt,
// world markers, minimap, or any other UI reads to answer "what can I do right now?". It is
// written only by the focus + input systems (throttled), so UI reads are cheap and stable.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { PromptData } from "./types";

export interface InteractionStoreState {
  /** Stable id of the focused interactable, or null when nothing is focused. */
  focusedId: string | null;
  /** The prompt to render for the focused interactable (null = nothing to show). */
  prompt: PromptData | null;
  /** 0..1 progress for hold-to-interact prompts. */
  holdProgress: number;
  /** Ids currently within range (sensor + distance validated). Mostly for debug / markers. */
  inRange: Set<string>;
}

interface InteractionStore extends InteractionStoreState {
  setFocus: (id: string | null, prompt: PromptData | null) => void;
  setHold: (progress: number) => void;
  addInRange: (id: string) => void;
  removeInRange: (id: string) => void;
  reset: () => void;
}

function promptsEqual(a: PromptData | null, b: PromptData | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.key === b.key &&
    a.verb === b.verb &&
    a.label === b.label &&
    a.hold === b.hold &&
    a.secondary?.key === b.secondary?.key &&
    a.secondary?.verb === b.secondary?.verb
  );
}

export const useInteractionStore = create<InteractionStore>()(
  subscribeWithSelector((set, get) => ({
    focusedId: null,
    prompt: null,
    holdProgress: 0,
    inRange: new Set<string>(),

    setFocus: (focusedId, prompt) => {
      const s = get();
      if (s.focusedId === focusedId && promptsEqual(s.prompt, prompt)) return;
      set({ focusedId, prompt });
    },

    setHold: (holdProgress) => {
      if (get().holdProgress !== holdProgress) set({ holdProgress });
    },

    addInRange: (id) => {
      const cur = get().inRange;
      if (cur.has(id)) return;
      const next = new Set(cur);
      next.add(id);
      set({ inRange: next });
    },

    removeInRange: (id) => {
      const cur = get().inRange;
      if (!cur.has(id)) return;
      const next = new Set(cur);
      next.delete(id);
      set({ inRange: next });
    },

    reset: () => set({ focusedId: null, prompt: null, holdProgress: 0, inRange: new Set() }),
  })),
);
