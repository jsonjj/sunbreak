// ECS augmentation for the Activities subsystem. Adds `act_`-prefixed components to the shared
// SimComponents interface via declaration merging (contract: shared/src/ecs/components.ts).
// This file MUST stay a module — the `import type` below is referenced in the interface, which
// keeps it a module and avoids silently replacing "@sunbreak/shared".

import type { ActivityMarkerData, ActivityNodeData } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Persistent world marker that offers an activity when the player is nearby. */
    act_marker?: ActivityMarkerData;
    /** Transient objective node (checkpoint / rampage target / delivery pickup|dropoff). */
    act_node?: ActivityNodeData;
    /** Presence tag: this node is currently armed for proximity evaluation. */
    act_armed?: true;
    /** Presence tag: this node was satisfied (kept for one frame so a renderer can react). */
    act_cleared?: true;
  }
}

export {};
