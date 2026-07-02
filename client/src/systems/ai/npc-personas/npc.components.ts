// ECS augmentation for ai/npc-personas. Declaration-merges the shared `SimComponents`
// interface from INSIDE this subsystem's folder (never edits the shared file). Every
// field is prefixed `npc_` and is optional / a presence-tag, per the Wave-2 contract.
import type { NpcArchetype, NpcMood } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Persona card id bound to this NPC (e.g. "sparks"). */
    npc_persona?: string;
    /** Presence tag: this entity can be talked to (proximity/interaction targets it). */
    npc_talkable?: true;
    /** Generic archetype fallback when no named persona is bound. */
    npc_archetype?: NpcArchetype;
    /** Display-name override for the nameplate. */
    npc_displayName?: string;
    /** Faction key (nameplate color / relationship grouping). */
    npc_faction?: string;
    /** Player↔NPC relationship / trust, 0..100 (defaults to 50 when unset). */
    npc_relationship?: number;
    /** Wall-clock ms of the last conversation — greeting/cooldown logic. */
    npc_lastTalkedMs?: number;
    /** Presence tag: currently in a conversation — ambient AI should pause its tick. */
    npc_inConversation?: true;
    /** Current mood; influences tone + nameplate tint. */
    npc_mood?: NpcMood;
  }
}

// Keep this file a MODULE so the `declare module` augments (never replaces) the shared
// types, even if the type-only import above is ever removed.
export {};
