// ─────────────────────────────────────────────────────────────────────────────
// ECS augmentation for the render/streaming subsystem.
//
// Every field is prefixed `stream_` (Wave-2 collision-avoidance convention) and is either
// optional (`?`) or a presence tag (`: true`). This file keeps a real top-level `import` so it
// stays a MODULE (a bare `declare module` would replace @sunbreak/shared and break every
// shared type — see shared/src/ecs/components.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { Vec3 } from "@sunbreak/shared";
import type { ColliderDesc } from "./manifest";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /**
     * ChunkKey ("cx:cz") the entity's content belongs to. ANY subsystem (peds, traffic, props,
     * pickups…) can tag an entity with this; the streaming activation system then toggles the
     * entity's `stream_active`/`isActive`/visibility purely by chunk residency + distance to the
     * streaming anchor. This is the primary "activate/deactivate entities by distance" contract.
     */
    stream_chunk?: string;

    /** Set by streaming while the entity is resident AND within its activation radius. */
    stream_active?: true;

    /** Coarse LOD band assigned by chunk distance (0 = highest detail). Renderers may read it. */
    stream_lod?: number;

    /** Marks the entity streaming should follow. Overrides the default (local player). */
    stream_anchor?: true;

    /** Tags the single entity that carries the streaming view root (bridged to R3F). */
    stream_root?: true;

    /**
     * A per-chunk static collider descriptor emitted on chunk load and removed on unload. The
     * physics subsystem (or <StreamingView>) mounts a fixed Rapier collider for each of these.
     */
    stream_collider?: ColliderDesc;

    /** The owning chunk key for streaming-emitted descriptor entities (colliders), for cleanup. */
    stream_ownerChunk?: string;

    /** Optional cached world anchor position (mirrors the anchor transform for debug/tools). */
    stream_anchorPos?: Vec3;
  }
}

export {};
