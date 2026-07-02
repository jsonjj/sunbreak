// The data contract streaming CONSUMES to build the world. The city / world-design subsystem
// (render/city) is expected to produce either a `RoadGraph` or a `ChunkSource`; when neither is
// provided, roadGraph.ts synthesizes a procedural source from the shared world constants so this
// subsystem is fully runnable on its own. All types are serializable POJOs (no THREE refs).
import type { Vec3Tuple } from "@sunbreak/shared";

export type BuildingMaterialKey = "concrete" | "brick" | "glass";

export type PropType =
  | "streetlight"
  | "tree"
  | "bench"
  | "hydrant"
  | "trashcan"
  | "planter";

/** One instanced prop placement (consumed into a global InstancedMesh pool). */
export interface PropPlacement {
  type: PropType;
  pos: Vec3Tuple;
  /** Y-axis rotation in radians. */
  rotY?: number;
  /** Uniform scale multiplier (default 1). */
  scale?: number;
}

/** A footprint building. Streaming merges these by material into few draw calls per chunk. */
export interface BuildingDesc {
  /** Footprint center (world). y is the ground height (usually 0). */
  pos: Vec3Tuple;
  /** Full extents [width(x), depth(z)]. */
  size: [number, number];
  height: number;
  rotY?: number;
  material?: BuildingMaterialKey;
}

/** A cuboid static collider (mounted as a fixed Rapier body by the physics subsystem). */
export interface ColliderDesc {
  /** Half-extents [hx, hy, hz]. */
  half: Vec3Tuple;
  /** World center. */
  pos: Vec3Tuple;
  rotY?: number;
}

/** A straight road/sidewalk segment in world XZ (rendered as a flat ribbon on the ground). */
export interface RoadSegment {
  a: [number, number];
  b: [number, number];
  width: number;
  kind?: "road" | "sidewalk";
}

/** A hero landmark that gets its own multi-level LOD (drei <Detailed> / manual LOD group). */
export interface HeroPlacement {
  id: string;
  pos: Vec3Tuple;
  rotY?: number;
  /** Approx height (m) — used to size proxy + LOD switch distances. */
  height?: number;
}

/** Everything needed to build one streamed chunk. */
export interface ChunkDesc {
  key: string;
  cx: number;
  cz: number;
  buildings: BuildingDesc[];
  roads: RoadSegment[];
  props: PropPlacement[];
  colliders: ColliderDesc[];
  hero?: HeroPlacement;
  /** Aggregate low-poly proxy blocks (big boxes) drawn in the far HLOD ring for this chunk. */
  proxy: BuildingDesc[];
}

/** The contract the city/world subsystem implements to feed streaming. */
export interface ChunkSource {
  /**
   * Return the descriptor for a chunk coordinate, or `null` for an empty cell (ocean / OOB).
   * Should be cheap and deterministic; heavy building work is time-sliced by the ChunkManager.
   */
  describe(cx: number, cz: number): ChunkDesc | null;
  /** Optional inclusive chunk bounds so streaming never requests cells outside the map. */
  bounds?: { minCx: number; minCz: number; maxCx: number; maxCz: number };
}

// ── Road-graph shapes (the "city road-graph" streaming consumes) ────────────────────────────
export interface RoadGraphNode {
  id: number;
  x: number;
  z: number;
}
export interface RoadGraphEdge {
  a: number;
  b: number;
  width: number;
  lanes?: number;
}
export interface RoadGraph {
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
}
