// ECS augmentation for the debug-tools subsystem.
//
// Per the Wave-2 contract we extend the shared `SimComponents` interface via declaration
// merging from INSIDE our own folder, prefix every field with `dbg_`, and keep every field
// optional (`?`) or a presence tag (`: true`). The `import type` below keeps this file a real
// module so the augmentation merges instead of replacing `@sunbreak/shared`.

import type { Vec3 } from "@sunbreak/shared";

/** What a debug-spawned entity represents (drives the placeholder mesh in the canvas layer). */
export type DbgSpawnKind = "car" | "prop" | "ped";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Invulnerable: the `dbg:god` system tops health back to max every frame. */
    dbg_god?: true;
    /** Marker for a noclip request (full noclip needs player-controller cooperation). */
    dbg_noclip?: true;
    /** Tags an entity that this subsystem spawned (rendered by the canvas layer; `killall` target). */
    dbg_spawned?: true;
    /** Currently highlighted in the entity inspector (mirrors `useDebugStore.selected`). */
    dbg_selected?: true;
    /** Human-readable label shown in the inspector list. */
    dbg_label?: string;
    /** Kind of a debug-spawned entity. */
    dbg_kind?: DbgSpawnKind;
    /** Placeholder tint (hex int, e.g. 0xff8844) for a spawned prop. */
    dbg_color?: number;
    /** Optional spawn velocity hint kept for future physics-enabled spawns. */
    dbg_spawnImpulse?: Vec3;
  }
}
