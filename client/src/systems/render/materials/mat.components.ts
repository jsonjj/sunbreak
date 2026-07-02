// ECS augmentation for the render/materials subsystem. All fields prefixed `mat_` per the Wave-2
// convention. Any subsystem can tag an entity with `mat_defId` and the apply system will bind the
// shared registry material to that entity's `three` object through the ECS↔R3F bridge.
//
// Keep a real import so this file stays a MODULE (a bare `declare module` would replace @sunbreak/shared).
import type { Vec3 } from "@sunbreak/shared";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Registry material def id to apply to this entity's meshes (see materialDefs). */
    mat_defId?: string;
    /** Internal: set once the material has been applied (drives the apply query). */
    mat_applied?: true;
    /** Instance override 0..1 — how readily puddles pool (yields a cached variant). */
    mat_puddleFactor?: number;
    /** Instance override 0..1 — how strongly the surface soaks/darkens when wet. */
    mat_porosity?: number;
    /** Instance override — emissive multiplier (push hero signage above the bloom threshold). */
    mat_emissiveBoost?: number;
    /** Instance override — region tint (Keys salt / panhandle fade), applied to base color. */
    mat_tint?: Vec3;
  }
}

export {};
