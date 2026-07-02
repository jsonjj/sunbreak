// ECS augmentation for the dialogue subsystem. We EXTEND the shared `SimComponents`
// interface via declaration merging from our OWN folder (never edit shared/**).
// Every field is prefixed `dlg_` per the Wave-2 collision convention.
//
// The ped / npc-personas subsystems ATTACH `dlg_conversable` to talk-able entities;
// this UI only READS it. `dlg_inConversation` is a presence-tag other AI can honor
// to pause an NPC's wander/patrol while the player is talking to them.

import type { Conversable } from "./contract";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Marks an entity as talk-able + carries its nameplate/persona metadata. */
    dlg_conversable?: Conversable;
    /** Set while this NPC is the player's active conversation partner. */
    dlg_inConversation?: true;
  }
}

export {};
