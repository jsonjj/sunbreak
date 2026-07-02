// The streaming engine singleton: owns the ChunkManager and adapts the various city inputs
// (RoadGraph, explicit ChunkDesc list, or a full ChunkSource) into the manager. Created lazily on
// first use (from index.ts init) and torn down on cleanup.
import type { ChunkDesc, ChunkSource, RoadGraph } from "./manifest";
import { chunkKey } from "./grid";
import { ChunkManager, type StreamStats } from "./chunkManager";
import { proceduralSource, roadGraphToSource } from "./roadGraph";

export class StreamingEngine {
  readonly manager: ChunkManager;

  constructor(source: ChunkSource = proceduralSource()) {
    this.manager = new ChunkManager(source);
  }

  /** The single THREE root the ECS↔R3F bridge (or <StreamingView>) mounts. */
  get root() {
    return this.manager.root;
  }

  /** Feed streaming a city road-graph; edges become roads, blocks are filled procedurally. */
  setRoadGraph(graph: RoadGraph): void {
    this.manager.setSource(roadGraphToSource(graph));
  }

  /** Feed streaming an explicit set of pre-authored chunk descriptors. */
  provideChunks(descs: ChunkDesc[]): void {
    const map = new Map<string, ChunkDesc>();
    for (const d of descs) map.set(chunkKey({ cx: d.cx, cz: d.cz }), d);
    this.manager.setSource({ describe: (cx, cz) => map.get(chunkKey({ cx, cz })) ?? null });
  }

  /** Feed streaming a fully custom source (city subsystem implements ChunkSource). */
  setChunkSource(source: ChunkSource): void {
    this.manager.setSource(source);
  }

  onChunkReady(cb: Parameters<ChunkManager["onChunkReady"]>[0]): () => void {
    return this.manager.onChunkReady(cb);
  }

  onChunkUnload(cb: Parameters<ChunkManager["onChunkUnload"]>[0]): () => void {
    return this.manager.onChunkUnload(cb);
  }

  getStats(): StreamStats {
    return this.manager.stats;
  }

  dispose(): void {
    this.manager.dispose();
  }
}

let engine: StreamingEngine | null = null;

/** Get (creating on first call) the process-wide streaming engine. */
export function getEngine(): StreamingEngine {
  if (!engine) engine = new StreamingEngine();
  return engine;
}

export function disposeEngine(): void {
  engine?.dispose();
  engine = null;
}
