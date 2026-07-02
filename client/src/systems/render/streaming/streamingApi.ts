// Public API surface the city/world subsystem + integrator use to feed and query streaming —
// WITHOUT importing this folder's internals. Consumed via a normal module import (no central
// edits): e.g. `import { streamingApi } from "@/systems/render/streaming"`.
import { getEngine } from "./engine";
import { ObjectPool } from "./objectPool";
import { STREAM_BUDGETS, currentBudget, type StreamBudget } from "./budgets";
import * as grid from "./grid";
import type { ChunkListener } from "./chunkManager";
import type { ChunkDesc, ChunkSource, RoadGraph } from "./manifest";

export const streamingApi = {
  /** The single THREE root to mount (only if NOT using the generic `stream_root` ECS bridge). */
  get root() {
    return getEngine().root;
  },
  get engine() {
    return getEngine();
  },
  /** Feed a city road-graph (edges → roads; blocks filled procedurally). */
  setRoadGraph(graph: RoadGraph): void {
    getEngine().setRoadGraph(graph);
  },
  /** Feed an explicit list of authored chunk descriptors. */
  provideChunks(descs: ChunkDesc[]): void {
    getEngine().provideChunks(descs);
  },
  /** Feed a fully custom ChunkSource (city implements the contract). */
  setChunkSource(source: ChunkSource): void {
    getEngine().setChunkSource(source);
  },
  /** Notified when a chunk finishes streaming in (spawners hook here). */
  onChunkReady(cb: ChunkListener): () => void {
    return getEngine().onChunkReady(cb);
  },
  /** Notified just before a chunk streams out (recycle entities here). */
  onChunkUnload(cb: ChunkListener): () => void {
    return getEngine().onChunkUnload(cb);
  },
  getStats() {
    return getEngine().getStats();
  },
  currentBudget,
  budgets: STREAM_BUDGETS,
  grid,
  ObjectPool,
};

export type { StreamBudget };
