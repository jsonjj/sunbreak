// render/streaming — WORLD STREAMING & LOD subsystem (client). Self-registers on import via the
// systems-loader glob (client/src/systems/*/*/index.ts → registerModule). Implements chunk-based
// streaming, LOD (hero manual LOD + coarse per-chunk instance LOD), HLOD far ring, global
// InstancedMesh prop pools, generic object pooling, and ECS activation of streamed entities by
// distance to the player. See gta6-build/01-render/world-streaming.md.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import "./streaming.components"; // activate the stream_* ECS augmentation
import { disposeEngine, getEngine } from "./engine";
import { buildStreamingSystems } from "./system";

type W = typeof world;

/** Quaternion (xyzw) for a rotation about +Y, so any consumer reading `transform.rotation` is
 *  correct without needing the collider's rotY field. */
function quatY(rotY: number): { x: number; y: number; z: number; w: number } {
  const h = rotY * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

export const streaming: SubsystemModule<W> = {
  id: "render/streaming",
  systems: buildStreamingSystems(),
  init() {
    const engine = getEngine();

    // Expose the streaming view root through the ECS↔R3F bridge instead of hand-mounting it into
    // App/Scene. A generic bridge (or <StreamingView>) renders this entity's `three`.
    const rootEntity: ClientEntity = { stream_root: true, three: engine.root };
    world.add(rootEntity);

    // Emit each resident chunk's static colliders as ECS descriptor entities so the physics
    // subsystem (or <StreamingView>) can mount fixed Rapier bodies. Removed on chunk unload.
    const colliderEntities = new Map<string, ClientEntity[]>();
    const offReady = engine.manager.onChunkReady((r) => {
      if (r.colliders.length === 0) return;
      const list: ClientEntity[] = [];
      for (const c of r.colliders) {
        // Only stream_* fields + a transform: no shared tags (e.g. isProp) that a sibling
        // renderer might key on. The physics subsystem queries world.with("stream_collider").
        const e: ClientEntity = {
          stream_collider: c,
          stream_ownerChunk: r.key,
          transform: {
            position: { x: c.pos[0], y: c.pos[1], z: c.pos[2] },
            rotation: quatY(c.rotY ?? 0),
          },
        };
        world.add(e);
        list.push(e);
      }
      colliderEntities.set(r.key, list);
    });
    const offUnload = engine.manager.onChunkUnload((r) => {
      const list = colliderEntities.get(r.key);
      if (!list) return;
      for (const e of list) world.remove(e);
      colliderEntities.delete(r.key);
    });

    return () => {
      offReady();
      offUnload();
      for (const list of colliderEntities.values()) for (const e of list) world.remove(e);
      colliderEntities.clear();
      world.remove(rootEntity);
      disposeEngine();
    };
  },
};

registerModule(streaming);

// ── Public exports (city subsystem + integrator import these; no central edits needed) ────────
export { streamingApi } from "./streamingApi";
export { StreamingView, type StreamingViewProps } from "./StreamingView";
export { ObjectPool, type PoolStats } from "./objectPool";
export { useStreamStats } from "./system";
export { STREAM_BUDGETS, currentBudget, type StreamBudget } from "./budgets";
export { getEngine } from "./engine";
export type { StreamStats, ChunkListener } from "./chunkManager";
export type { ChunkResident, HeroInstance } from "./chunkLoader";
export * from "./manifest";
export * as streamGrid from "./grid";
