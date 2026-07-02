// Pure, isomorphic road nav-graph + A* routing. No engine deps (the canon `ngraph.path` /
// `comlink` / `rbush` are NOT pre-installed for this wave — see the report), so the graph, the
// binary-heap open set and the search are all hand-rolled here.
import { MAX_ROAD_SPEED, ROAD_SPEED } from "./mapConstants";
import { dist } from "./coords";
import type { Road, RouteResult, Vec2 } from "./mapTypes";

interface Edge {
  to: number;
  w: number; // seconds (length / class speed)
}

export interface RoadGraph {
  nodes: Vec2[];
  edges: Edge[][];
  nearestNode: (p: Vec2) => number;
}

/** Snap coordinates to whole metres so shared intersections fuse into one node. */
const key = (x: number, z: number): string => `${Math.round(x)}:${Math.round(z)}`;

export function buildRoadGraph(roads: Road[]): RoadGraph {
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
    for (const e of list) if (e.to === b) return; // dedupe parallel segments
    list.push({ to: b, w });
  };

  for (const road of roads) {
    const speed = ROAD_SPEED[road.cls];
    for (let i = 0; i < road.pts.length - 1; i++) {
      const a = road.pts[i]!;
      const b = road.pts[i + 1]!;
      const ai = nodeAt(a);
      const bi = nodeAt(b);
      const len = dist(a.x, a.z, b.x, b.z);
      const w = len / speed;
      link(ai, bi, w);
      link(bi, ai, w);
    }
  }

  const nearestNode = (p: Vec2): number => {
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

  return { nodes, edges, nearestNode };
}

// ── Binary min-heap keyed by fScore (index-based, no per-push object churn) ─────
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
    const n = this.ids.length;
    const topId = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastF = this.fs.pop()!;
    if (n > 1) {
      this.ids[0] = lastId;
      this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < this.ids.length && this.fs[l]! < this.fs[smallest]!) smallest = l;
        if (r < this.ids.length && this.fs[r]! < this.fs[smallest]!) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return topId;
  }

  private swap(a: number, b: number): void {
    const ti = this.ids[a]!;
    this.ids[a] = this.ids[b]!;
    this.ids[b] = ti;
    const tf = this.fs[a]!;
    this.fs[a] = this.fs[b]!;
    this.fs[b] = tf;
  }
}

const heuristic = (a: Vec2, b: Vec2): number => dist(a.x, a.z, b.x, b.z) / MAX_ROAD_SPEED;

/** A* over the road graph. Returns a world-space polyline (origin → snapped path → destination). */
export function findRoute(g: RoadGraph, from: Vec2, to: Vec2): RouteResult {
  if (g.nodes.length === 0) return { ok: false, path: [], distance: Infinity };

  const s = g.nearestNode(from);
  const t = g.nearestNode(to);
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
    if (u === t) return reconstruct(nodes, came, from, to, t);
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

  return { ok: false, path: [], distance: Infinity };
}

function reconstruct(
  nodes: Vec2[],
  came: Map<number, number>,
  from: Vec2,
  to: Vec2,
  t: number,
): RouteResult {
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

export function polylineLength(pts: Vec2[]): number {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    d += dist(a.x, a.z, b.x, b.z);
  }
  return d;
}
