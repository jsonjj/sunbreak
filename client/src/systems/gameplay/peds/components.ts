// ECS augmentation — PEDESTRIAN AI's own components (prefix `ped_`).
//
// Declaration-merges the shared `SimComponents` interface from INSIDE this subsystem's folder
// (Wave-2 contract). All fields are optional and prefixed `ped_` to avoid collisions with the
// ~36 sibling subsystems. The `import type` below keeps this file a MODULE (a bare `declare
// module` with no import/export would silently replace the shared module and break its types).

import type { PedAgent, PedRagdollRequest } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Core per-ped simulation blob (nav + kinematics + FSM + fear + LOD + render slot). */
    ped_agent?: PedAgent;

    /** Presence tag on the single entity that hosts the ped InstancedMesh group (`three`). */
    ped_renderRoot?: true;

    /**
     * Death → ragdoll handoff. Set on a ped the frame it dies (alongside `isDead`). The
     * physics/ragdoll subsystem queries `world.with("ped_ragdoll")`, spawns one pooled Rapier
     * ragdoll at this transform/impulse, and sets `handled=true`. See integrator notes.
     */
    ped_ragdoll?: PedRagdollRequest;
  }
}

export {}; // ensure module status even if the import is ever tree-shaken
