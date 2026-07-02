// ECS augmentation for physics/animation. Adds `anim_*` components to the shared SimComponents
// via declaration merging (never edit shared/). All fields are optional POJOs — the live
// AnimationMixer stays on the existing `mixer` view component, and the per-entity controller
// (with THREE.AnimationAction refs) lives in this subsystem's driver store, not on the entity.
//
// NOTE: the `import type` below keeps this file a real module; without an import/export a
// `declare module` block silently REPLACES @sunbreak/shared and breaks every shared type.

import type { AnimLocomotionConfig, AnimLocomotionReadout, AnimLodTier } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Presence opts the entity into the locomotion blend-tree driver; value tunes feel. */
    anim_locomotion?: AnimLocomotionConfig;
    /** Compact per-frame blend readout written back by the driver (HUD / debug / v4 net). */
    anim_state?: AnimLocomotionReadout;
    /** Optional crowd LOD tier controlling mixer tick rate (default = near/every frame). */
    anim_lod?: AnimLodTier;
  }
}

export {};
