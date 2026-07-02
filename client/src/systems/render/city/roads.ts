// Road-network generator. Uses the robust axis-aligned grid fallback from the spec: a jittered
// street grid across the bounds with a promoted arterial spine. Emits a deduped `RoadGraph`
// (nodes + classified edges) plus the grid scaffold that blocks.ts subdivides.
import {
  BLOCK_SPACING,
  BLOCK_SPACING_JITTER,
  CITY_HALF,
  COLLECTOR_EVERY,
  ROAD_LANES,
  ROAD_WIDTHS,
} from "./config";
import { deriveSeed, jitter, mulberry32, type Rng } from "./prng";
import type { RoadClass, RoadEdge, RoadGraph, RoadNode } from "./types";

export interface CityGrid {
  xs: number[];
  zs: number[];
  nx: number;
  nz: number;
  /** class of each vertical line (indexed by x). */
  vClass: RoadClass[];
  /** class of each horizontal line (indexed by z). */
  hClass: RoadClass[];
}

export interface RoadResult {
  graph: RoadGraph;
  grid: CityGrid;
}

export const widthFor = (k: RoadClass): number => ROAD_WIDTHS[k];
export const lanesFor = (k: RoadClass): number => ROAD_LANES[k];

export const nodeIdAt = (grid: CityGrid, i: number, j: number): number => j * grid.nx + i;

/** Half carriageway width of the vertical line at index i. */
export const vHalfWidth = (grid: CityGrid, i: number): number => widthFor(grid.vClass[i] ?? "local") / 2;
/** Half carriageway width of the horizontal line at index j. */
export const hHalfWidth = (grid: CityGrid, j: number): number => widthFor(grid.hClass[j] ?? "local") / 2;

function generateAxis(rng: Rng, min: number, max: number, arterials: number[]): number[] {
  const coords: number[] = [min];
  let x = min;
  // Walk from min→max laying jittered grid lines.
  for (;;) {
    x += BLOCK_SPACING + jitter(rng, BLOCK_SPACING_JITTER);
    if (x >= max - BLOCK_SPACING * 0.4) break;
    coords.push(x);
  }
  coords.push(max);

  // Snap the nearest grid line onto each arterial coord so arterials fall exactly on the grid.
  for (const a of arterials) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs((coords[i] ?? Infinity) - a);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    coords[best] = a;
  }

  coords.sort((p, q) => p - q);

  // Dedupe near-coincident lines (post-snap).
  const out: number[] = [];
  for (const c of coords) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(c - last) > 4) out.push(c);
  }
  return out;
}

function classifyLine(coord: number, index: number, arterials: number[]): RoadClass {
  for (const a of arterials) if (Math.abs(coord - a) < 0.5) return "arterial";
  if (index % COLLECTOR_EVERY === 0) return "collector";
  return "local";
}

/** Build the full road graph + grid scaffold for a seed. */
export function buildRoads(seed: number, arterialX: number[], arterialZ: number[]): RoadResult {
  const rng = mulberry32(deriveSeed(seed, "roads"));
  const H = CITY_HALF;

  const xs = generateAxis(rng, -H, H, arterialX);
  const zs = generateAxis(rng, -H, H, arterialZ);
  const nx = xs.length;
  const nz = zs.length;

  const vClass: RoadClass[] = xs.map((c, i) => classifyLine(c, i, arterialX));
  const hClass: RoadClass[] = zs.map((c, j) => classifyLine(c, j, arterialZ));

  const grid: CityGrid = { xs, zs, nx, nz, vClass, hClass };

  const nodes: RoadNode[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      nodes.push({ id: j * nx + i, x: xs[i]!, z: zs[j]! });
    }
  }

  const edges: RoadEdge[] = [];
  const addEdge = (a: number, b: number, klass: RoadClass) => {
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const length = Math.hypot(nb.x - na.x, nb.z - na.z);
    edges.push({ a, b, klass, width: widthFor(klass), lanes: lanesFor(klass), length });
  };

  // Vertical edges (segments of vertical lines).
  for (let i = 0; i < nx; i++) {
    const k = vClass[i]!;
    for (let j = 0; j < nz - 1; j++) addEdge(j * nx + i, (j + 1) * nx + i, k);
  }
  // Horizontal edges (segments of horizontal lines).
  for (let j = 0; j < nz; j++) {
    const k = hClass[j]!;
    for (let i = 0; i < nx - 1; i++) addEdge(j * nx + i, j * nx + i + 1, k);
  }

  return { graph: { nodes, edges }, grid };
}
