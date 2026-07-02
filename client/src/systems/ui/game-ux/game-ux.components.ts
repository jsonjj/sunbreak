// ECS augmentation for the game-ux subsystem. Declaration-merged into the shared
// SimComponents so these flow into SimEntity/ClientEntity automatically. Every field is
// prefixed `ux_` per the wave contract and is optional / a presence-tag (entities hold only
// a Partial of the component set). The `import type` below keeps this file a real module so
// the `declare module` augments (rather than replaces) `@sunbreak/shared`.
import type { Vec3 } from "@sunbreak/shared";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Tag an entity as a shop trigger; value is the vendor id used to look up a catalog. */
    ux_shopVendorId?: string;
    /** Link an entity (e.g. an NPC) to a phone contact id so interaction can open a thread. */
    ux_phoneContactId?: string;
    /** Optional world position used for a "nearby vendor/contact" prompt (defaults to transform). */
    ux_uiAnchor?: Vec3;
    /** Internal: set once when the death overlay has been emitted for the current death so the
     *  finish-phase watcher emits `player:death` exactly once per death (cleared on revive). */
    ux_deathAckd?: true;
  }
}

export {};
