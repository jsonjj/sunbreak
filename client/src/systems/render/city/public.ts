// Stable public surface of the render/city subsystem — the "shared-consumable" contract other
// subsystems import (`import { cityStore, type RoadGraph } from "@/systems/render/city"`).
// The road graph is also on the ECS (world.with("city_map")); pick whichever channel fits.
export { CITY_HALF, CITY_SEED, TILE_SIZE } from "./config";
export {
  chance,
  deriveSeed,
  jitter,
  mulberry32,
  pick,
  pickWeighted,
  range,
  rangeInt,
  splitmix32,
  type Rng,
} from "./prng";
export { generateCity } from "./generate";
export { cityStore, ensureCityMap, regenerateCity, useCityStore } from "./store";
export { isBuildingAt, resolveOutOfBuildings, setBuildingIndex } from "./occupancy";
export { buildWalkGraph, nearestRoadNode, roadAdjacency, toMapData } from "./graph";
export { makeTileGrid, tileCenter, tileIdAt, tilesNear } from "./tiling";
export type * from "./types";
