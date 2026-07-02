// physics/ragdoll — Ragdoll & Hit Reactions ("REFLEX-Lite").
//
// Passive Rapier-jointed ragdoll + impulse hit-reactions + pooled/capped LOD governor, driven
// entirely through the ECS. Self-registers below; the shared Rapier world arrives via
// <RagdollBridge> (see wiring notes at the bottom of this file). Never edits v0.
//
// Trigger contract we CONSUME (from combat / gameplay):
//   • shared `isDead: true` on a humanoid entity  → lethal ragdoll
//   • `ragdoll_hit?: RagdollHitRequest` component  → flinch / stagger / knockdown / death
//   • imperative: triggerRagdoll(entity, hit?) / triggerHitReaction(entity, hit)
// In every case we add the `ragdoll_active` tag and drive the rest from the ECS.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { ragdollDirector } from "./director";
import type { HitReactionParams, RapierNamespace, RapierWorld } from "./types";
// Side-effect import: pulls in the `ragdoll_*` SimComponents declaration merge.
import "./ragdoll.components";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "physics/ragdoll",
  systems: [
    {
      name: "ragdoll:update",
      phase: "update",
      order: 50,
      fn: (_w, dt) => ragdollDirector.update(dt),
    },
    {
      // Fallback view sync when no <RagdollBridge> drives useAfterPhysicsStep. When the bridge IS
      // mounted this is a no-op (the bridge syncs post-solve for tighter results).
      name: "ragdoll:renderSync",
      phase: "render",
      order: 50,
      fn: () => ragdollDirector.renderSync(),
    },
  ],
};

registerModule(mod);

// ── Public API (imperative; mirrors the ECS components) ───────────────────────
/** Force a full ragdoll (lethal unless the hit says otherwise). */
export function triggerRagdoll(entity: ClientEntity, hit?: HitReactionParams): void {
  ragdollDirector.triggerRagdoll(entity, hit);
}

/** Route an incoming hit to the right reaction (flinch / stagger / knockdown / death). */
export function triggerHitReaction(entity: ClientEntity, hit: HitReactionParams): void {
  ragdollDirector.triggerHitReaction(entity, hit);
}

/** ECS-first alternative: write the request component (combat can also set it directly). */
export function requestRagdollHit(entity: ClientEntity, hit: HitReactionParams): void {
  if (!entity.ragdoll_hit) world.addComponent(entity, "ragdoll_hit", hit);
  else entity.ragdoll_hit = hit;
}

/** True while an entity is in a full ragdoll (not during a survivable get-up / powered reaction). */
export function isRagdolling(entity: ClientEntity): boolean {
  return ragdollDirector.isRagdolling(entity);
}

/** Subscribe to settle events (AI/controller pause logic, ped despawn). Returns an unsubscribe. */
export function onRagdollSettled(
  listener: (entity: ClientEntity, lethal: boolean) => void,
): () => void {
  return ragdollDirector.onSettled(listener);
}

/**
 * Integrator seam: hand the shared Rapier world to the director from any component that already
 * has a useRapier() context, INSTEAD of mounting <RagdollBridge>. In this mode bone sync runs in
 * the render phase (before/after-physics driving of get-up & powered limbs won't run).
 */
export function attachRagdollWorld(rapier: RapierNamespace, rworld: RapierWorld): void {
  ragdollDirector.attachWorld(rapier, rworld, false);
}

export { RagdollBridge } from "./RagdollBridge";
export { ragdollDirector } from "./director";
export type {
  BoneId,
  HitReactionParams,
  HitType,
  RagdollHitRequest,
  RagdollNetEvent,
  RagdollPhase,
  RagdollTier,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATOR WIRING NOTES
// ─────────────────────────────────────────────────────────────────────────────
// 1. Mount the bridge ONCE inside the physics root so the director gets the shared Rapier world
//    and physics-step timing (this file only self-registers ECS systems — it can't mount R3F):
//
//        import { RagdollBridge } from "@/systems/physics/ragdoll";
//        // inside <PhysicsProvider> … </PhysicsProvider> in client/src/game/Scene.tsx:
//        <RagdollBridge />
//
//    …or, without a component, call `attachRagdollWorld(rapier, world)` once from any existing
//    component that has `useRapier()`.
//
// 2. Combat kills/impacts: set shared `isDead` (lethal) and/or write `ragdoll_hit` (or call
//    triggerRagdoll / triggerHitReaction). Nothing else to wire — the update system reacts.
//
// 3. Entities need a view `three` root; a Mixamo-skinned `SkinnedMesh` under it upgrades from the
//    single-capsule flop (Tier2) to the full jointed rig (Tier0/1). Optional `mixer` is faded out
//    on activation and is the seam for additive hit-react / get-up clips (Animation subsystem).
