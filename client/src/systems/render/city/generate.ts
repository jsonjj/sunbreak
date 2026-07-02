// Pipeline entry point: roads → blocks → lots → buildings → props → colliders → spawns →
// tile index, assembled into the emitted `CityMapDoc` ("santa-vista.map.json"). Pure &
// deterministic: same seed → identical doc on every client (MP-safe). No THREE imports.
import { CITY_HALF, CITY_SEED, TILE_SIZE } from "./config";
import { authorDistricts } from "./districts";
import { buildRoads } from "./roads";
import { buildBlocks } from "./blocks";
import { buildLots } from "./lots";
import { buildBuildings } from "./buildings";
import { buildProps } from "./props";
import { buildTileIndex, makeTileGrid, tileIdAt, type TileGrid } from "./tiling";
import { polygonBounds } from "./geo";
import { chance, deriveSeed, mulberry32 } from "./prng";
import { validateMapDoc } from "./schema";
import type {
  BuildingSpec,
  CityBounds,
  CityMapDoc,
  Collider,
  Landmark,
  RoadGraph,
  SpawnPoint,
} from "./types";

function buildColliders(
  buildings: BuildingSpec[],
  landmarks: Landmark[],
  bounds: CityBounds,
  tileGrid: TileGrid,
): Collider[] {
  const colliders: Collider[] = [];

  // Ground/road plane — a single fixed slab under the whole core (drivable surface).
  colliders.push({
    kind: "cuboid",
    tile: 0,
    halfExtents: [CITY_HALF, 0.5, CITY_HALF],
    position: [(bounds.min.x + bounds.max.x) / 2, -0.5, (bounds.min.z + bounds.max.z) / 2],
    rotationY: 0,
    tag: "ground",
  });

  for (const b of buildings) {
    colliders.push({
      kind: "cuboid",
      tile: b.tile,
      halfExtents: [b.width / 2, b.height / 2, b.depth / 2],
      position: [b.center.x, b.height / 2, b.center.z],
      rotationY: b.rotationY,
      tag: "building",
    });
  }

  // Solid hero volumes block movement; open strips (Neon Mile) + the over-water pier don't.
  const SOLID: ReadonlySet<Landmark["kind"]> = new Set(["tower", "stadium", "mall", "hangar"]);
  for (const l of landmarks) {
    if (!SOLID.has(l.kind)) continue;
    const r = polygonBounds(l.footprint);
    const hx = (r.x1 - r.x0) / 2;
    const hz = (r.z1 - r.z0) / 2;
    colliders.push({
      kind: "cuboid",
      tile: tileIdAt(tileGrid, l.position[0], l.position[2]),
      halfExtents: [hx, l.height / 2, hz],
      position: [l.position[0], l.height / 2, l.position[2]],
      rotationY: l.rotationY,
      tag: "landmark",
    });
  }

  return colliders;
}

function buildSpawns(graph: RoadGraph, landmarks: Landmark[], seed: number): SpawnPoint[] {
  const rng = mulberry32(deriveSeed(seed, "spawns"));
  const spawns: SpawnPoint[] = [];

  // Player: on the road nearest the origin.
  let best = graph.nodes[0];
  let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = n.x * n.x + n.z * n.z;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (best) {
    spawns.push({ id: "player_0", kind: "player", position: [best.x + 5, 2, best.z + 5], yaw: 0 });
  }

  // Vehicles: scattered on the graph.
  const degree = new Map<number, number>();
  for (const e of graph.edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  let vi = 0;
  let pi = 0;
  for (const n of graph.nodes) {
    const deg = degree.get(n.id) ?? 0;
    if (deg >= 3 && chance(rng, 0.12) && vi < 12) {
      spawns.push({
        id: `vehicle_${vi++}`,
        kind: "vehicle",
        position: [n.x + 4, 1, n.z],
        yaw: Math.PI / 2,
      });
    }
    if (deg >= 2 && chance(rng, 0.14) && pi < 20) {
      spawns.push({ id: `ped_${pi++}`, kind: "ped", position: [n.x - 3, 1, n.z - 3], yaw: 0 });
    }
  }

  // A signature spawn beside each landmark.
  for (const l of landmarks) {
    spawns.push({
      id: `poi_${l.id}`,
      kind: "ped",
      position: [l.position[0], 1, l.position[2] - 20],
      yaw: 0,
    });
  }

  return spawns;
}

/** Run the full generation pipeline and emit the city document. */
export function generateCity(seed: number = CITY_SEED): CityMapDoc {
  const input = authorDistricts();
  const { graph, grid } = buildRoads(seed, input.arterials.x, input.arterials.z);
  const tileGrid = makeTileGrid(input.bounds);

  const blocks = buildBlocks(grid, input.districts, input.landmarks, tileGrid);
  const lots = buildLots(blocks, input.districts, seed);
  const buildings = buildBuildings(lots, input.districts, seed);
  const { props, sidewalks, crosswalks } = buildProps(blocks, graph, tileGrid, seed);
  const colliders = buildColliders(buildings, input.landmarks, input.bounds, tileGrid);
  const spawns = buildSpawns(graph, input.landmarks, seed);
  const tiles = buildTileIndex(tileGrid, buildings, props, graph.nodes);

  const doc: CityMapDoc = {
    version: 1,
    seed,
    bounds: input.bounds,
    tileSize: TILE_SIZE,
    roads: graph,
    districts: input.districts,
    blocks,
    lots,
    buildings,
    props,
    sidewalks,
    crosswalks,
    landmarks: input.landmarks,
    colliders,
    spawns,
    tiles,
  };

  if (import.meta.env.DEV) {
    try {
      validateMapDoc(doc);
    } catch (err) {
      console.warn("[render/city] emitted map doc failed schema validation:", err);
    }
  }

  return doc;
}
