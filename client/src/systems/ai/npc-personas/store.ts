// Zustand mirror of the ACTIVE conversation — a convenience for dialogue-ui (or the HUD)
// to reactively render the current conversation without wiring subscriptions manually.
// The conversation handle returned by `startConversation` remains the primary contract;
// this store just tracks whichever one is currently active.
import { create } from "zustand";
import type { NpcConversationState } from "./types";

interface NpcDialogueStore {
  /** The active conversation's latest state, or null when nothing is open. */
  active: NpcConversationState | null;
  setActive: (state: NpcConversationState | null) => void;
}

export const useNpcDialogueStore = create<NpcDialogueStore>((set) => ({
  active: null,
  setActive: (active) => set({ active }),
}));

export function setActiveConversationState(state: NpcConversationState): void {
  useNpcDialogueStore.getState().setActive(state);
}

export function clearActiveConversationState(): void {
  useNpcDialogueStore.getState().setActive(null);
}
