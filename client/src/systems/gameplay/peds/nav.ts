// Navigation layer for ambient peds.
//
// Peds walk a graph of walkable nodes (world-XZ) via neighbour-to-neighbour steering (kinematic,
// non-Rapier). Two interchangeable providers implement `NavProvider`:
//
//   • GraphNavProvider — the REAL path: a *sidewalk graph derived from the city road-graph*
//     (City-Gen's `MapDoc.roads`). Each road edge yields two sidewalk polylines offset to either
//     side; intersections are corner-connected. This is what "sidewalk wander using the city
//     road-graph via shared data" means — inject it with `setPedRoadGraph(mapDoc.roads)`.
//
//   • GridNavProvider — a procedural lattice fallback so peds wander immediately even before
//     City-Gen lands (the task-approved "grid/waypoint graph" escape hatch). Analytic, no memory.
//
// The road-graph shape is consumed *structurally* (see types.RoadGraphInput) so we never import a
// sibling's not-yet-existing shared type. A recast navmesh wrapper could also implement
// NavProvider later (we avoid recast now: it needs a Vite `optimizeDeps.exclude` we're not
// allowed to add, plus a baked navmesh that doesn't exist yet).

import {
  GRID_HALF_EXTENT,
  GRID_SPACING,
  NAV_BUCKET,
  SIDEWALK_OFFSET,
  SIDEWALK_STEP,
} from "./config";
import type { NavProvider, RoadGraphInput, RoadNodeInput } from "./types";

const DEFAULT_ROAD_WIDTH = 8;

// ── Fallback: infinite lattice grid ──────────────────────────────────────────────────────────
// Node id packs lattice indices (i,j). No storage — positions/neighbours are computed on demand.

const GRID_OFFSET = 8192; // keeps encoded ids non-negative
const GRID_STRIDE = GRID_OFFSET * 2 + 1;

class GridNavProvider implements NavProvider {
  readonly kind = "grid";
  readonly ready = true;
  readonly nodeCount = Number.POSITIVE_INFINITY;
  private readonly spacing: number;
  private readonly maxIndex: number;
  private readonly nbuf: number[] = [];

  constructor(spacing = GRID_SPACING, halfExtent = GRID_HALF_EXTENT) {
    this.spacing = spacing;
    this.maxIndex = Math.max(1, Math.floor(halfExtent / spacing));
  }

  private clamp(i: number): number {
    return i < -this.maxIndex ? -this.maxIndex : i > this.maxIndex ? this.maxIndex : i;
  }
  private encode(i: number, j: number): number {
    return (i + GRID_OFFSET) * GRID_STRIDE + (j + GRID_OFFSET);
  }
  private decodeI(id: number): number {
    return Math.floor(id / GRID_STRIDE) - GRID_OFFSET;
  }
  private decodeJ(id: number): number {
    return (id % GRID_STRIDE) - GRID_OFFSET;
  }

  nearestNode(x: number, z: number): number {
    const i = this.clamp(Math.round(x / this.spacing));
    const j = this.clamp(Math.round(z / this.spacing));
    return this.encode(i, j);
  }

  nodePos(node: number, out: { x: number; z: number }): { x: number; z: number } {
    out.x = this.decodeI(node) * this.spacing;
    out.z = this.decodeJ(node) * this.spacing;
    return out;
  }

  neighbors(node: number): number[] {
    const i = this.decodeI(node);
    const j = this.decodeJ(node);
    const out = this.nbuf;
    out.length = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < -this.maxIndex || ni > this.maxIndex || nj < -this.maxIndex || nj > this.maxIndex)
          continue;
        out.push(this.encode(ni, nj));
      }
    }
    return out;
  }

  randomNodeAround(
    x: number,
    z: number,
    minR: number,
    maxR: number,
    rng: () => number,
  ): number {
    const ang = rng() * Math.PI * 2;
    const r = minR + (maxR - minR) * Math.sqrt(rng());
    return this.nearestNode(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
  }

  fleeNode(
    x: number,
    z: number,
    awayX: number,
    awayZ: number,
    radius: number,
    rng: () => number,
  ): number {
    let dx = x - awayX;
    let dz = z - awayZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const jitter = (rng() - 0.5) * 0.8; // ±0.4 rad spread
    const c = Math.cos(jitter);
    const s = Math.sin(jitter);
    const rx = dx * c - dz * s;
    const rz = dx * s + dz * c;
    return this.nearestNode(x + rx * radius, z + rz * radius);
  }
}

// ── Real: sidewalk graph derived from a road-graph ──────────────────────────────────────────

function readNode(nodes: RoadNodeInput[] | Float32Array, i: number, stride: 2 | 3, out: {
  x: number;
  z: number;
}): void {
  if (nodes instanceof Float32Array) {
    out.x = nodes[i * stride] ?? 0;
    out.z = nodes[i * stride + (stride === 3 ? 2 : 1)] ?? 0;
    return;
  }
  const n = nodes[i] as RoadNodeInput;
  if (Array.isArray(n)) {
    out.x = n[0] ?? 0;
    out.z = (n.length >= 3 ? n[2] : n[1]) ?? 0;
  } else {
    out.x = n.x;
    out.z = n.z;
  }
}

const EMPTY: number[] = [];

class GraphNavProvider implements NavProvider {
  readonly kind = "sidewalk-graph";
  ready = false;
  nodeCount = 0;

  private nx: number[] = [];
  private nz: number[] = [];
  private adj: number[][] = [];
  private buckets = new Map<number, number[]>();

  constructor(road: RoadGraphInput) {
    try {
      this.build(road);
      this.ready = this.nodeCount > 0;
    } catch {
      this.ready = false;
    }
  }

  private addNode(x: number, z: number): number {
    const id = this.nx.length;
    this.nx.push(x);
    this.nz.push(z);
    this.adj.push([]);
    return id;
  }
  private link(a: number, b: number): void {
    if (a === b) return;
    if (!this.adj[a]!.includes(b)) this.adj[a]!.push(b);
    if (!this.adj[b]!.includes(a)) this.adj[b]!.push(a);
  }
  private bkey(x: number, z: number): number {
    const i = Math.floor(x / NAV_BUCKET) + 4096;
    const j = Math.floor(z / NAV_BUCKET) + 4096;
    return i * 8193 + j;
  }

  private build(road: RoadGraphInput): void {
    const rawCount = road.nodes instanceof Float32Array
      ? Math.floor(road.nodes.length / (road.stride ?? (road.nodes.length % 3 === 0 ? 3 : 2)))
      : road.nodes.length;
    const stride: 2 | 3 = road.stride ?? (road.nodes instanceof Float32Array && road.nodes.length % 3 === 0 ? 3 : 2);

    const a = { x: 0, z: 0 };
    const b = { x: 0, z: 0 };
    // road-node index -> sidewalk endpoints created at that corner (for corner-connection)
    const corners = new Map<number, number[]>();
    const addCorner = (roadIdx: number, sidewalkNode: number) => {
      let list = corners.get(roadIdx);
      if (!list) corners.set(roadIdx, (list = []));
      list.push(sidewalkNode);
    };

    for (const e of road.edges) {
      if (e.a < 0 || e.b < 0 || e.a >= rawCount || e.b >= rawCount || e.a === e.b) continue;
      readNode(road.nodes, e.a, stride, a);
      readNode(road.nodes, e.b, stride, b);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz; // left perpendicular
      const pz = ux;
      const off = (e.width ?? DEFAULT_ROAD_WIDTH) / 2 + SIDEWALK_OFFSET;
      const segs = Math.max(1, Math.ceil(len / SIDEWALK_STEP));

      for (const side of [1, -1] as const) {
        const ox = px * off * side;
        const oz = pz * off * side;
        let prev = this.addNode(a.x + ox, a.z + oz);
        addCorner(e.a, prev);
        for (let k = 1; k <= segs; k++) {
          const t = k / segs;
          const cx = a.x + dx * t + ox;
          const cz = a.z + dz * t + oz;
          const cur = this.addNode(cx, cz);
          this.link(prev, cur);
          prev = cur;
        }
        addCorner(e.b, prev);
      }
    }

    // Corner connection: ring-link the sidewalk endpoints meeting at each road node (sorted by
    // angle) so peds can round corners / cross between streets' sidewalks at intersections.
    for (const [roadIdx, list] of corners) {
      if (list.length < 2) continue;
      readNode(road.nodes, roadIdx, stride, a);
      list.sort((p, q) => {
        const ap = Math.atan2(this.nz[p]! - a.z, this.nx[p]! - a.x);
        const aq = Math.atan2(this.nz[q]! - a.z, this.nx[q]! - a.x);
        return ap - aq;
      });
      for (let k = 0; k < list.length; k++) {
        this.link(list[k]!, list[(k + 1) % list.length]!);
      }
    }

    this.nodeCount = this.nx.length;
    // Spatial buckets for nearest/annulus queries.
    for (let id = 0; id < this.nodeCount; id++) {
      const key = this.bkey(this.nx[id]!, this.nz[id]!);
      let arr = this.buckets.get(key);
      if (!arr) this.buckets.set(key, (arr = []));
      arr.push(id);
    }
  }

  nearestNode(x: number, z: number): number {
    let best = -1;
    let bestD2 = Infinity;
    const bi = Math.floor(x / NAV_BUCKET);
    const bj = Math.floor(z / NAV_BUCKET);
    for (let ring = 0; ring <= 6; ring++) {
      for (let di = -ring; di <= ring; di++) {
        for (let dj = -ring; dj <= ring; dj++) {
          if (ring > 0 && Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue; // shell only
          const key = (bi + di + 4096) * 8193 + (bj + dj + 4096);
          const arr = this.buckets.get(key);
          if (!arr) continue;
          for (const id of arr) {
            const ddx = this.nx[id]! - x;
            const ddz = this.nz[id]! - z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = id;
            }
          }
        }
      }
      if (best >= 0 && ring >= 1) break; // found something; one extra shell for safety
    }
    return best;
  }

  nodePos(node: number, out: { x: number; z: number }): { x: number; z: number } {
    out.x = this.nx[node] ?? 0;
    out.z = this.nz[node] ?? 0;
    return out;
  }

  neighbors(node: number): number[] {
    return this.adj[node] ?? EMPTY;
  }

  randomNodeAround(
    x: number,
    z: number,
    minR: number,
    maxR: number,
    rng: () => number,
  ): number {
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = rng() * Math.PI * 2;
      const r = minR + (maxR - minR) * Math.sqrt(rng());
      const node = this.nearestNode(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
      if (node < 0) continue;
      const ddx = this.nx[node]! - x;
      const ddz = this.nz[node]! - z;
      const d = Math.hypot(ddx, ddz);
      if (d >= minR * 0.6 && d <= maxR * 1.5) return node;
    }
    return this.nearestNode(x, z);
  }

  fleeNode(
    x: number,
    z: number,
    awayX: number,
    awayZ: number,
    radius: number,
    rng: () => number,
  ): number {
    let dx = x - awayX;
    let dz = z - awayZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const jitter = (rng() - 0.5) * 0.7;
    const c = Math.cos(jitter);
    const s = Math.sin(jitter);
    const rx = dx * c - dz * s;
    const rz = dx * s + dz * c;
    return this.nearestNode(x + rx * radius, z + rz * radius);
  }
}

// ── Active provider + injection API ─────────────────────────────────────────────────────────

let active: NavProvider = new GridNavProvider();

/** The nav provider peds currently use (grid fallback until a road-graph is injected). */
export const getNav = (): NavProvider => active;
export const navReady = (): boolean => active.ready;

/**
 * Inject the city road-graph (City-Gen `MapDoc.roads`). Builds a sidewalk graph and switches peds
 * onto it. Falls back to the grid if the graph is empty/invalid. Safe to call any time (e.g. once
 * the map finishes loading).
 */
export function setPedRoadGraph(road: RoadGraphInput | null | undefined): boolean {
  if (!road || !road.nodes || !road.edges || road.edges.length === 0) return false;
  const g = new GraphNavProvider(road);
  if (!g.ready) return false;
  active = g;
  return true;
}

/** Advanced: supply a fully custom provider (e.g. a recast-navigation wrapper). */
export function setPedNavProvider(provider: NavProvider): void {
  active = provider;
}

/** Reset to the procedural lattice fallback. */
export function useFallbackGrid(): void {
  active = new GridNavProvider();
}

// ── Movement helpers (provider-agnostic) ────────────────────────────────────────────────────

/** Random neighbour of `node`, preferring not to backtrack to `exclude`. −1 if isolated. */
export function randomNeighbor(node: number, rng: () => number, exclude = -1): number {
  const ns = active.neighbors(node);
  if (ns.length === 0) return -1;
  if (ns.length === 1) return ns[0]!;
  // prefer neighbours that aren't the one we came from
  let pick = -1;
  let tries = 0;
  do {
    pick = ns[(rng() * ns.length) | 0]!;
    tries++;
  } while (pick === exclude && tries < 4);
  return pick;
}

/** Neighbour of `node` that maximises distance from (tx,tz) — greedy flee along the graph. */
export function fleeNeighbor(node: number, tx: number, tz: number): number {
  const ns = active.neighbors(node);
  if (ns.length === 0) return -1;
  let best = ns[0]!;
  let bestD2 = -1;
  const p = scratch;
  for (const n of ns) {
    active.nodePos(n, p);
    const dx = p.x - tx;
    const dz = p.z - tz;
    const d2 = dx * dx + dz * dz;
    if (d2 > bestD2) {
      bestD2 = d2;
      best = n;
    }
  }
  return best;
}

const scratch = { x: 0, z: 0 };
