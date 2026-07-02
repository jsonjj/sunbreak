// Consumer-facing views over the emitted doc. These are the "shared-consumable structures"
// the road graph is exposed through: a directed-adjacency helper + nearest-node lookup for
// traffic/wanted routing, a walkable graph for pedestrians, and a 2D `MapData` for the minimap.
import { dist } from "./geo";
import type {
  CityMapDoc,
  MapArea,
  MapData,
  MapPoi,
  MapRoad,
  MapRoadClass,
  RoadClass,
  RoadGraph,
  RoadNode,
  WalkEdge,
  WalkGraph,
  WalkNode,
} from "./types";

// ── Road graph helpers (traffic / wanted-police) ─────────────────────────────

/** Undirected adjacency list: node id → connected node ids. */
export function roadAdjacency(graph: RoadGraph): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of graph.edges) {
    link(e.a, e.b);
    link(e.b, e.a);
  }
  return adj;
}

/** Nearest road node to a world point (linear scan; graphs here are small). */
export function nearestRoadNode(graph: RoadGraph, x: number, z: number): RoadNode | undefined {
  let best: RoadNode | undefined;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    const dx = n.x - x;
    const dz = n.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// ── Minimap view ─────────────────────────────────────────────────────────────

const MAP_CLASS: Record<RoadClass, MapRoadClass> = {
  arterial: "arterial",
  collector: "street",
  local: "alley",
};

/** Project the doc into the minimap's `MapData` (roads as 2-pt polylines, districts as areas). */
export function toMapData(doc: CityMapDoc): MapData {
  const nodeById = new Map<number, RoadNode>();
  for (const n of doc.roads.nodes) nodeById.set(n.id, n);

  const roads: MapRoad[] = [];
  doc.roads.edges.forEach((e, i) => {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (!a || !b) return;
    roads.push({ id: i, cls: MAP_CLASS[e.klass], pts: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }] });
  });

  const areas: MapArea[] = doc.districts.map((d, i) => ({
    id: i,
    kind: "district",
    name: d.name,
    poly: d.poly,
    label: {
      x: d.poly.reduce((s, p) => s + p.x, 0) / d.poly.length,
      z: d.poly.reduce((s, p) => s + p.z, 0) / d.poly.length,
    },
  }));

  const pois: MapPoi[] = [];
  let pid = 0;
  for (const l of doc.landmarks) {
    pois.push({ id: pid++, type: "landmark", name: l.name, at: { x: l.position[0], z: l.position[2] } });
  }
  for (const s of doc.spawns) {
    if (s.kind !== "player") continue;
    pois.push({ id: pid++, type: "safehouse", name: "Spawn", at: { x: s.position[0], z: s.position[2] } });
  }

  return { version: doc.version, bounds: doc.bounds, roads, areas, pois };
}

// ── Pedestrian walkable graph ─────────────────────────────────────────────────

/** Build a walkable graph from sidewalk polylines + crosswalks (dedup at 0.5 m). */
export function buildWalkGraph(doc: CityMapDoc): WalkGraph {
  const nodes: WalkNode[] = [];
  const edges: WalkEdge[] = [];
  const index = new Map<string, number>();

  const key = (x: number, z: number) => `${Math.round(x * 2)}_${Math.round(z * 2)}`;
  const nodeAt = (x: number, z: number, kind: WalkNode["kind"]): number => {
    const k = key(x, z);
    const existing = index.get(k);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ id, x, z, kind });
    index.set(k, id);
    return id;
  };

  for (const s of doc.sidewalks) {
    const a = nodeAt(s.a.x, s.a.z, "corner");
    const b = nodeAt(s.b.x, s.b.z, "corner");
    if (a !== b) edges.push({ a, b, length: dist(s.a, s.b), kind: "sidewalk" });
  }

  for (const c of doc.crosswalks) {
    const cn = nodeAt(c.at.x, c.at.z, "crosswalk");
    // Link crossing node to the nearest sidewalk corner (approximate connection).
    let best = -1;
    let bestD = Infinity;
    for (const n of nodes) {
      if (n.kind !== "corner") continue;
      const d = (n.x - c.at.x) ** 2 + (n.z - c.at.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    if (best >= 0) {
      edges.push({ a: cn, b: best, length: Math.sqrt(bestD), kind: "crossing" });
    }
  }

  return { nodes, edges };
}
