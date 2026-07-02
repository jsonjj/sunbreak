// ECS augmentation for the interaction subsystem (declaration merging — never edit shared).
// Prefix is `interact_` per the Wave-2 component contract; every field is optional or a
// presence-tag so entities only ever hold a Partial of these.

import type { InteractVerbConfig } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /**
     * Presence + config marking an entity as interactable. Add this (directly, via
     * `markInteractable`, or via `<Interactable>`) to register a verb; the focus loop reads it.
     */
    interact_?: InteractVerbConfig;
    /** Runtime tag: set by the focus loop on the currently focused entity (for renderers). */
    interact_focused?: true;
    /** Runtime tag: set while the entity is within range of the player. */
    interact_inRange?: true;
    /** Author tag: skip this entity in focus without removing `interact_`. */
    interact_disabled?: true;
  }
}

export {};
