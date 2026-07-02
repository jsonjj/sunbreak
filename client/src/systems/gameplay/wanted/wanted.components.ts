// ECS augmentation for the wanted/police subsystem. Adds `wanted_*` components to the shared
// `SimComponents` via TypeScript declaration merging (the Wave-2 "extend, don't fork"
// contract). This file MUST stay a module — the `import type` lines below guarantee that, so
// the `declare module` augments rather than replaces `@sunbreak/shared`.
import type { Vec3 } from "@sunbreak/shared";
import type {
  WantedPolice,
  WantedPerception,
  WantedPursuit,
  WantedSearch,
} from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Present on every police unit: archetype, tactical role, agency, FSM state. */
    wanted_police?: WantedPolice;
    /** Sight cone + hearing range + last-seen timestamp for detection. */
    wanted_perception?: WantedPerception;
    /** Active pursuit parameters (target + speed + stand-off). */
    wanted_pursuit?: WantedPursuit;
    /** Active search parameters (last-known-position probability sweep). */
    wanted_search?: WantedSearch;
    /** Pool tag: the unit is currently deployed (absence = idle in the pool). */
    wanted_active?: true;
    /** Tag: this unit is a static roadblock prop rather than a mobile pursuer. */
    wanted_roadblock?: true;
    /** Tag on the suspect (player) while heat > 0. */
    wanted_target?: true;
    /** Mirror of the current star level, written onto the player entity for other systems. */
    wanted_stars?: number;
    /** Patrol/return anchor a recycled unit heads back toward. */
    wanted_home?: Vec3;
  }
}

export {};
