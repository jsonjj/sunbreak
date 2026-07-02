// GPS routing over the city road graph — a hand-rolled A* (no extra deps). The graph is built once
// from the baked city roads and reused; `computeRoute` memoises on the snapped from/to node pair so
// the minimap can call it every frame cheaply. Falls back to a straight line when the graph is empty
// or the destination is unreachable, so the map always shows *some* direction to the waypoint.
import { getMapData } from "./cityData";
import { MAX_ROAD_SPEED, ROAD_SPEED } from "./palette";
import type { MapRoadClass } from "./palette";
import { dist } from "./geometry";
import type { RouteResult, Vec2 } from "./types";

interface Edge {
  to: number;
  w: number; // seconds (length / class speed)
}

interface Graph {
  nodes: Vec2[];
  edges: Edge[][];
  nearest: (p: Vec2) => number;
}

let graph: Graph | null = null;
let graphKey = -1;

const key = (x: number, z: number): string => `${Math.round(x)}:${Math.round(z)}`;

function buildGraph(): Graph | null {
  const data = getMapData();
  if (!data) return null;

  const nodes: Vec2[] = [];
  const edges: Edge[][] = [];
  const index = new Map<string, number>();

  const nodeAt = (p: Vec2): number => {
    const k = key(p.x, p.z);
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ x: p.x, z: p.z });
      edges.push([]);
      index.set(k, i);
    }
    return i;
  };
  const link = (a: number, b: number, w: number): void => {
    if (a === b) return;
    const list = edges[a]!;
    for (const e of list) if (e.to === b) return;
    list.push({ to: b, w });
  };

  for (const road of data.roads) {
    const speed = ROAD_SPEED[(road.cls as MapRoadClass) ?? "street"] ?? ROAD_SPEED.street;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const a = road.pts[i]!;
      const b = road.pts[i + 1]!;
      const ai = nodeAt(a);
      const bi = nodeAt(b);
      const w = dist(a.x, a.z, b.x, b.z) / speed;
      link(ai, bi, w);
      link(bi, ai, w);
    }
  }

  const nearest = (p: Vec2): number => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const d = dist(p.x, p.z, n.x, n.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  return { nodes, edges, nearest };
}

function ensureGraph(): Graph | null {
  const data = getMapData();
  const seed = data ? data.version * 1_000 + data.roads.length : -1;
  if (graph && graphKey === seed) return graph;
  graph = buildGraph();
  graphKey = graph ? seed : -1;
  return graph;
}

// ── Binary min-heap keyed by fScore (index-based, no per-push object churn) ──────
class MinHeap {
  private ids: number[] = [];
  private fs: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, f: number): void {
    this.ids.push(id);
    this.fs.push(f);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.fs[parent]! <= this.fs[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const topId = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastF = this.fs.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < this.ids.length && this.fs[l]! < this.fs[s]!) s = l;
        if (r < this.ids.length && this.fs[r]! < this.fs[s]!) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return topId;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.fs[a], this.fs[b]] = [this.fs[b]!, this.fs[a]!];
  }
}

const heuristic = (a: Vec2, b: Vec2): number => dist(a.x, a.z, b.x, b.z) / MAX_ROAD_SPEED;

export function polylineLength(pts: Vec2[]): number {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    d += dist(a.x, a.z, b.x, b.z);
  }
  return d;
}

function straightLine(from: Vec2, to: Vec2): RouteResult {
  const path = [from, to];
  return { ok: true, path, distance: polylineLength(path) };
}

// Memoise on the snapped node pair so repeated per-frame calls are basically free.
let cache: { s: number; t: number; result: RouteResult } | null = null;

/** A* over the road graph → world polyline (origin → snapped path → destination). */
export function computeRoute(from: Vec2, to: Vec2): RouteResult {
  const g = ensureGraph();
  if (!g || g.nodes.length === 0) return straightLine(from, to);

  const s = g.nearest(from);
  const t = g.nearest(to);
  if (s < 0 || t < 0) return straightLine(from, to);
  if (cache && cache.s === s && cache.t === t) {
    // Re-anchor the cached path to the live origin/destination (endpoints move each frame).
    const path = cache.result.path.slice();
    if (path.length >= 2) {
      path[0] = from;
      path[path.length - 1] = to;
    }
    return { ok: cache.result.ok, path, distance: polylineLength(path) };
  }

  const result = search(g, from, to, s, t);
  cache = { s, t, result };
  return result;
}

function search(g: Graph, from: Vec2, to: Vec2, s: number, t: number): RouteResult {
  const nodes = g.nodes;
  if (s === t) {
    const path = [from, nodes[s]!, to];
    return { ok: true, path, distance: polylineLength(path) };
  }

  const gScore = new Map<number, number>([[s, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(s, heuristic(nodes[s]!, nodes[t]!));

  while (open.size > 0) {
    const u = open.pop();
    if (u === t) {
      const chain: number[] = [t];
      let cur = t;
      while (came.has(cur)) {
        cur = came.get(cur)!;
        chain.push(cur);
      }
      chain.reverse();
      const path: Vec2[] = [from];
      for (const n of chain) path.push(nodes[n]!);
      path.push(to);
      return { ok: true, path, distance: polylineLength(path) };
    }
    if (closed.has(u)) continue;
    closed.add(u);

    const gu = gScore.get(u)!;
    for (const e of g.edges[u]!) {
      if (closed.has(e.to)) continue;
      const alt = gu + e.w;
      if (alt < (gScore.get(e.to) ?? Infinity)) {
        gScore.set(e.to, alt);
        came.set(e.to, u);
        open.push(e.to, alt + heuristic(nodes[e.to]!, nodes[t]!));
      }
    }
  }

  return straightLine(from, to);
}
