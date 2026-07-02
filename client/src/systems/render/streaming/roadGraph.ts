// ChunkSource producers. The city/world subsystem is expected to hand streaming a `RoadGraph`
// (or a full `ChunkSource`); `roadGraphToSource()` adapts a graph into per-chunk descriptors.
// When nothing is provided, `proceduralSource()` synthesizes a deterministic Santa-Vista-style
// grid city from the shared world constants so the subsystem runs and renders standalone.
import { MAP_SIZE } from "@sunbreak/shared";
import type {
  BuildingDesc,
  BuildingMaterialKey,
  ChunkDesc,
  ChunkSource,
  ColliderDesc,
  PropPlacement,
  RoadGraph,
  RoadSegment,
} from "./manifest";
import { CELL, chunkKey } from "./grid";

// ── Deterministic RNG (per chunk) ───────────────────────────────────────────────────────────
function hashSeed(cx: number, cz: number): number {
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ (cx & 0xffff), 16777619);
  h = Math.imul(h ^ (cz & 0xffff), 16777619);
  h = Math.imul(h ^ (cx >>> 16), 16777619);
  h = Math.imul(h ^ (cz >>> 16), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HALF = MAP_SIZE * 0.5;
const CELLS = Math.floor(MAP_SIZE / CELL); // e.g. 2000/100 = 20
const MIN_C = Math.floor(-HALF / CELL);
const MAX_C = MIN_C + CELLS - 1;
const DEFAULT_BOUNDS = { minCx: MIN_C, minCz: MIN_C, maxCx: MAX_C, maxCz: MAX_C };

const ROAD_W = 9;
const SIDEWALK_W = 3;
const HERO_KEY = "0:0";

function districtMaterial(distFromCenter: number): BuildingMaterialKey {
  if (distFromCenter < 260) return "glass"; // downtown towers
  if (distFromCenter < 620) return "concrete"; // midtown
  return "brick"; // outer residential
}

/** Perimeter roads on the south (min-z) and west (min-x) edges so neighbours share edges. */
function edgeRoads(x0: number, z0: number): RoadSegment[] {
  const x1 = x0 + CELL;
  const z1 = z0 + CELL;
  return [
    { a: [x0, z0], b: [x1, z0], width: ROAD_W, kind: "road" },
    { a: [x0, z0], b: [x0, z1], width: ROAD_W, kind: "road" },
    { a: [x0, z0 + ROAD_W], b: [x1, z0 + ROAD_W], width: SIDEWALK_W, kind: "sidewalk" },
    { a: [x0 + ROAD_W, z0], b: [x0 + ROAD_W, z1], width: SIDEWALK_W, kind: "sidewalk" },
  ];
}

/** Streetlights + a little furniture along the block's two road edges. */
function edgeProps(x0: number, z0: number, rng: () => number): PropPlacement[] {
  const out: PropPlacement[] = [];
  const inset = ROAD_W + SIDEWALK_W * 0.5;
  for (let t = 12; t < CELL - 8; t += 22) {
    out.push({ type: "streetlight", pos: [x0 + t, 0, z0 + inset], rotY: Math.PI });
    out.push({ type: "streetlight", pos: [x0 + inset, 0, z0 + t], rotY: Math.PI / 2 });
    if (rng() < 0.5) out.push({ type: "tree", pos: [x0 + t + 6, 0, z0 + inset], scale: 0.8 + rng() * 0.6 });
    if (rng() < 0.3) out.push({ type: "bench", pos: [x0 + t, 0, z0 + inset + 1.2], rotY: rng() * Math.PI });
    if (rng() < 0.2) out.push({ type: "hydrant", pos: [x0 + inset, 0, z0 + t + 6] });
    if (rng() < 0.2) out.push({ type: "trashcan", pos: [x0 + t + 3, 0, z0 + inset] });
  }
  return out;
}

function blockBuildings(
  cx: number,
  cz: number,
  rng: () => number,
): { buildings: BuildingDesc[]; colliders: ColliderDesc[]; proxy: BuildingDesc[] } {
  const x0 = cx * CELL;
  const z0 = cz * CELL;
  const cxw = x0 + CELL * 0.5;
  const czw = z0 + CELL * 0.5;
  const distC = Math.hypot(cxw, czw);
  const material = districtMaterial(distC);

  // Interior block, inset past the roads/sidewalks.
  const margin = ROAD_W + SIDEWALK_W + 3;
  const bx0 = x0 + margin;
  const bz0 = z0 + margin;
  const span = CELL - margin - 4;
  const grid = distC < 260 ? 2 : rng() < 0.5 ? 2 : 3; // downtown = bigger footprints
  const cellW = span / grid;

  const buildings: BuildingDesc[] = [];
  const colliders: ColliderDesc[] = [];
  let maxH = 0;
  for (let gz = 0; gz < grid; gz++) {
    for (let gx = 0; gx < grid; gx++) {
      if (rng() < 0.12) continue; // occasional empty lot / courtyard
      const pad = 2 + rng() * 2;
      const w = cellW - pad;
      const d = cellW - pad;
      const baseH = distC < 260 ? 40 : distC < 620 ? 16 : 8;
      const h = baseH * (0.5 + rng() * 1.6);
      const px = bx0 + gx * cellW + cellW * 0.5;
      const pz = bz0 + gz * cellW + cellW * 0.5;
      buildings.push({ pos: [px, 0, pz], size: [w, d], height: h, material });
      colliders.push({ half: [w * 0.5, h * 0.5, d * 0.5], pos: [px, h * 0.5, pz] });
      maxH = Math.max(maxH, h);
    }
  }

  // One aggregate proxy block for the whole chunk silhouette (drawn in the far HLOD ring).
  const proxy: BuildingDesc[] = buildings.length
    ? [{ pos: [cxw, 0, czw], size: [span, span], height: maxH * 0.9, material }]
    : [];

  return { buildings, colliders, proxy };
}

/** Deterministic procedural city over the shared map extent. */
export function proceduralSource(): ChunkSource {
  return {
    bounds: DEFAULT_BOUNDS,
    describe(cx, cz): ChunkDesc | null {
      const key = chunkKey({ cx, cz });
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const rng = mulberry32(hashSeed(cx, cz));
      const roads = edgeRoads(x0, z0);
      const props = edgeProps(x0, z0, rng);

      if (key === HERO_KEY) {
        // Plaza chunk: hero tower, no block buildings.
        return {
          key,
          cx,
          cz,
          buildings: [],
          roads,
          props,
          colliders: [{ half: [12, 60, 12], pos: [x0 + CELL * 0.5, 60, z0 + CELL * 0.5] }],
          hero: { id: "solaris-tower", pos: [x0 + CELL * 0.5, 0, z0 + CELL * 0.5], height: 120 },
          proxy: [{ pos: [x0 + CELL * 0.5, 0, z0 + CELL * 0.5], size: [22, 22], height: 120, material: "glass" }],
        };
      }

      const { buildings, colliders, proxy } = blockBuildings(cx, cz, rng);
      return { key, cx, cz, buildings, roads, props, colliders, proxy };
    },
  };
}

// ── Road-graph → ChunkSource adapter ────────────────────────────────────────────────────────
/** Liang–Barsky clip of segment (a→b) to the axis-aligned box [x0,x1]×[z0,z1]. */
function clipSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): [number, number, number, number] | null {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null; // parallel & outside
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [ax + t0 * dx, az + t0 * dz, ax + t1 * dx, az + t1 * dz];
}

/**
 * Build a ChunkSource from a city RoadGraph: each chunk renders the graph edges clipped to its
 * cell (real roads from the city) and scatters procedural buildings/props into the block so the
 * city layout drives streaming. Falls back to procedural blocks where the graph is sparse.
 */
export function roadGraphToSource(
  graph: RoadGraph,
  bounds = DEFAULT_BOUNDS,
): ChunkSource {
  const nodeById = new Map<number, { x: number; z: number }>();
  for (const n of graph.nodes) nodeById.set(n.id, { x: n.x, z: n.z });

  return {
    bounds,
    describe(cx, cz): ChunkDesc | null {
      const key = chunkKey({ cx, cz });
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const rng = mulberry32(hashSeed(cx, cz));

      const roads: RoadSegment[] = [];
      for (const e of graph.edges) {
        const a = nodeById.get(e.a);
        const b = nodeById.get(e.b);
        if (!a || !b) continue;
        const clipped = clipSegment(a.x, a.z, b.x, b.z, x0, z0, x1, z1);
        if (!clipped) continue;
        roads.push({ a: [clipped[0], clipped[1]], b: [clipped[2], clipped[3]], width: e.width, kind: "road" });
      }

      const { buildings, colliders, proxy } = blockBuildings(cx, cz, rng);
      const props = edgeProps(x0, z0, rng);
      return { key, cx, cz, buildings, roads, props, colliders, proxy };
    },
  };
}
