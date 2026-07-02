// physics/ragdoll — the R3F ↔ physics seam.
//
// This is the ONE component an integrator mounts (once) inside <Physics> so the ragdoll director
// gets the shared Rapier world + precise physics-step timing. It renders nothing. We deliberately
// do NOT hand-mount it into App/Scene ourselves (subsystem rule); see index.ts wiring notes.
//
//   <PhysicsProvider> … <RagdollBridge /> … </PhysicsProvider>
//
// If you prefer not to mount a component, call attachRagdollWorld(rapier, world) from any existing
// component that already has a useRapier() context — the director then falls back to syncing bones
// in the render phase (before/after-physics hooks won't run in that mode).

import { useEffect } from "react";
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { ragdollDirector } from "./director";

export function RagdollBridge() {
  const { world, rapier } = useRapier();

  useEffect(() => {
    ragdollDirector.attachWorld(rapier, world, true);
    return () => ragdollDirector.detachWorld();
  }, [rapier, world]);

  useBeforePhysicsStep(() => ragdollDirector.beforePhysics());
  useAfterPhysicsStep(() => ragdollDirector.afterPhysics());

  return null;
}
