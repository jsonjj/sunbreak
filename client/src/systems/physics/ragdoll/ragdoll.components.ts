// physics/ragdoll — ECS augmentation. Adds the `ragdoll_*` components to the shared SimComponents
// via declaration merging (NEVER edit shared/ecs/components.ts directly). Every field is optional
// or a presence-tag and serializable (the runtime rig lives in the director, keyed off `netId`/
// entity — only the numeric `ragdoll_handle` pool slot is stored here).

// Keep a real import so this file stays a MODULE (a bare `declare module` would replace, not
// merge, and would break every shared type).
import type { Vec3 } from "@sunbreak/shared";
import type { RagdollHitRequest, RagdollPhase, RagdollTier } from "./types";

// Referenced once so the import is never elided by the compiler.
export type RagdollImpactPoint = Vec3;

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Presence tag: this entity is currently ragdolling / reacting. The subsystem's core signal. */
    ragdoll_active?: true;
    /** Consumed request written by combat to trigger a reaction/ragdoll. Cleared once processed. */
    ragdoll_hit?: RagdollHitRequest;
    /** Current lifecycle phase (mirror of the director's internal state). */
    ragdoll_state?: RagdollPhase;
    /** Chosen LOD tier: 0 = full rig, 1 = reduced, 2 = single-capsule flop / canned. */
    ragdoll_tier?: RagdollTier;
    /** Pool slot of the acquired rig, or -1 for the canned (no-rig) path. */
    ragdoll_handle?: number;
    /** Presence tag: this ragdoll is a death (despawn) rather than a survivable knockdown. */
    ragdoll_lethal?: true;
  }
}
