// City data store — the ergonomic, shared-consumable access layer over the emitted doc.
// Reactive consumers (minimap React) use `useCityStore`; hot-path systems (traffic, peds) use
// the non-reactive `cityStore` accessor to avoid re-renders. The road graph is ALSO mirrored
// onto the ECS world (see city.components.ts + render.ts), so consumers can choose either
// channel; both point at the same POJO.
import { create } from "zustand";
import { CITY_SEED } from "./config";
import { generateCity } from "./generate";
import { buildWalkGraph, nearestRoadNode, roadAdjacency, toMapData } from "./graph";
import { setBuildingIndex } from "./occupancy";
import { tilesNear } from "./tiling";
import type { CityMapDoc, MapData, RoadGraph, RoadNode, WalkGraph } from "./types";

interface Point2 {
  x: number;
  z: number;
}

interface CityStoreState {
  doc: CityMapDoc | null;
  mapData: MapData | null;
  walkGraph: WalkGraph | null;
  seed: number;
  status: "empty" | "ready";
  setDoc: (doc: CityMapDoc) => void;
}

/** Reactive store (Zustand). Minimap/UI subscribe here. */
export const useCityStore = create<CityStoreState>((set) => ({
  doc: null,
  mapData: null,
  walkGraph: null,
  seed: CITY_SEED,
  status: "empty",
  setDoc: (doc) => {
    // Rebuild the building-footprint index so peds/traffic can reject spawns + steer around
    // buildings (kept in sync with the doc the renderer + colliders use).
    setBuildingIndex(doc);
    set({
      doc,
      mapData: toMapData(doc),
      walkGraph: buildWalkGraph(doc),
      seed: doc.seed,
      status: "ready",
    });
  },
}));

/** Ensure a doc exists, generating it lazily from the default seed if needed. */
export function ensureCityMap(seed: number = CITY_SEED): CityMapDoc {
  const current = useCityStore.getState().doc;
  if (current && current.seed === seed) return current;
  const doc = generateCity(seed);
  useCityStore.getState().setDoc(doc);
  return doc;
}

/** Re-generate the city for a new seed (debug / new-game). */
export function regenerateCity(seed: number): CityMapDoc {
  const doc = generateCity(seed);
  useCityStore.getState().setDoc(doc);
  return doc;
}

/**
 * Non-reactive accessor for the hot path. `traffic-ai` uses `cityStore.getTilesNear(...)` and
 * `cityStore.roadGraph`; peds use `walkGraph`; minimap can read `mapData`.
 */
export const cityStore = {
  get map(): CityMapDoc | null {
    return useCityStore.getState().doc;
  },
  get roadGraph(): RoadGraph | null {
    return useCityStore.getState().doc?.roads ?? null;
  },
  get mapData(): MapData | null {
    return useCityStore.getState().mapData;
  },
  get walkGraph(): WalkGraph | null {
    return useCityStore.getState().walkGraph;
  },
  /** Tile ids within `radius` meters of a world point (streaming/spatial queries). */
  getTilesNear(pos: Point2, radius: number): number[] {
    const doc = useCityStore.getState().doc;
    if (!doc) return [];
    const t = doc.tiles;
    return tilesNear(
      { size: t.size, cols: t.cols, rows: t.rows, originX: t.originX, originZ: t.originZ },
      pos.x,
      pos.z,
      radius,
    );
  },
  /** Nearest road-graph node to a world point (routing snap). */
  nearestNode(x: number, z: number): RoadNode | undefined {
    const g = useCityStore.getState().doc?.roads;
    return g ? nearestRoadNode(g, x, z) : undefined;
  },
  /** Undirected road adjacency (built on demand). */
  adjacency(): Map<number, number[]> {
    const g = useCityStore.getState().doc?.roads;
    return g ? roadAdjacency(g) : new Map();
  },
};
