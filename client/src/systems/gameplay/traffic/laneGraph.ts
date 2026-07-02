// Lane graph: derive a DIRECTED lane network from City-Gen's undirected road graph, then provide
// arc-length sampling, A* routing (for wanted-police), chokepoint lookup, and nearest-lane queries.
// Also ships a procedural Manhattan-grid fallback so traffic runs standalone before City-Gen lands.
import { CLASS_LANES, CLASS_SPEED, CLASS_WIDTH, GREEN_S, GROUND_Y, YELLOW_S } from "./config";
import { clamp, yawFromDir, type XYZ } from "./math";
import type {
  Intersection,
  Lane,
  LaneGraph,
  LightPhase,
  RoadClass,
  RoadEdge,
  RoadGraphInput,
  RoadNode,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────
export function buildLaneGraph(input: RoadGraphInput): LaneGraph {
  const nodes = input.nodes;
  const nodeById = new Map<number, RoadNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const lanes: Lane[] = [];
  const laneById = new Map<number, Lane>();
  const outLanes = new Map<number, number[]>();
  const inLanes = new Map<number, number[]>();
  let nextLaneId = 0;

  const pushToMap = (m: Map<number, number[]>, key: number, value: number): void => {
    const arr = m.get(key);
    if (arr) arr.push(value);
    else m.set(key, [value]);
  };

  const pushLane = (
    from: RoadNode,
    to: RoadNode,
    offset: number,
    perpX: number,
    perpZ: number,
    klass: RoadClass,
    laneW: number,
    speed: number,
  ): void => {
    const sx = from.x + perpX * offset;
    const sz = from.z + perpZ * offset;
    const ex = to.x + perpX * offset;
    const ez = to.z + perpZ * offset;
    const dx = ex - sx;
    const dz = ez - sz;
    const length = Math.hypot(dx, dz);
    if (length < 0.5) return;
    const lane: Lane = {
      id: nextLaneId++,
      from: from.id,
      to: to.id,
      points: new Float32Array([sx, GROUND_Y, sz, ex, GROUND_Y, ez]),
      cum: new Float32Array([0, length]),
      length,
      width: laneW,
      speedLimit: speed,
      classId: klass,
      successors: [],
      intersectionId: -1,
      midX: (sx + ex) * 0.5,
      midZ: (sz + ez) * 0.5,
    };
    lanes.push(lane);
    laneById.set(lane.id, lane);
    pushToMap(outLanes, from.id, lane.id);
    pushToMap(inLanes, to.id, lane.id);
  };

  for (const e of input.edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) continue;
    const klass: RoadClass = e.klass ?? "street";
    const lanesPerDir = Math.max(1, e.lanes ?? CLASS_LANES[klass]);
    const speed = e.speedLimit ?? CLASS_SPEED[klass];
    const dirCount = e.oneway ? 1 : 2;
    const laneW = clamp(
      e.width ? e.width / (dirCount * lanesPerDir) : CLASS_WIDTH[klass],
      2.6,
      4.2,
    );

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    // "right of travel" perpendicular for the forward (a→b) direction.
    const fRightX = uz;
    const fRightZ = -ux;

    for (let i = 0; i < lanesPerDir; i++) {
      const off = laneW * (i + 0.5);
      pushLane(a, b, off, fRightX, fRightZ, klass, laneW, speed);
      if (!e.oneway) pushLane(b, a, off, -fRightX, -fRightZ, klass, laneW, speed);
    }
  }

  // Wire successors (exclude U-turns unless dead-end).
  for (const lane of lanes) {
    const candidates = outLanes.get(lane.to) ?? [];
    const forward: number[] = [];
    for (const cid of candidates) {
      const c = laneById.get(cid)!;
      if (c.to !== lane.from) forward.push(cid);
    }
    lane.successors = forward.length > 0 ? forward : candidates.slice();
  }

  // Build signalized intersections at real crossings (incoming lanes on BOTH axes).
  const intersections: Intersection[] = [];
  const intersectionById = new Map<number, Intersection>();
  let nextIntId = 0;
  for (const node of nodes) {
    const incoming = inLanes.get(node.id) ?? [];
    if (incoming.length < 2) continue;
    const groupEW: number[] = []; // approaches travelling mostly along X
    const groupNS: number[] = []; // approaches travelling mostly along Z
    for (const lid of incoming) {
      const l = laneById.get(lid)!;
      const hx = l.points[3]! - l.points[0]!;
      const hz = l.points[5]! - l.points[2]!;
      if (Math.abs(hx) >= Math.abs(hz)) groupEW.push(lid);
      else groupNS.push(lid);
    }
    if (groupEW.length === 0 || groupNS.length === 0) continue; // a bend/merge, not a crossing
    const inter: Intersection = {
      id: nextIntId++,
      node: node.id,
      groups: [groupEW, groupNS],
      phase: 0,
      timer: GREEN_S,
      yellow: false,
      greenDuration: GREEN_S,
      yellowDuration: YELLOW_S,
      boxBusy: false,
      boxGroup: -1,
    };
    intersections.push(inter);
    intersectionById.set(inter.id, inter);
    for (const lid of incoming) laneById.get(lid)!.intersectionId = inter.id;
  }

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.z < minZ) minZ = n.z;
    if (n.z > maxZ) maxZ = n.z;
  }
  if (!Number.isFinite(minX)) {
    minX = minZ = -1;
    maxX = maxZ = 1;
  }

  return {
    lanes,
    nodes,
    intersections,
    laneById,
    intersectionById,
    outLanes,
    bounds: { minX, minZ, maxX, maxZ },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sampling
// ─────────────────────────────────────────────────────────────────────────────
/** Write the world position of arc-length `s` on `lane` into `out`; returns the yaw (radians). */
export function sampleLane(lane: Lane, s: number, out: XYZ): number {
  const cum = lane.cum;
  const pts = lane.points;
  const sc = clamp(s, 0, lane.length);
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1]! < sc) i++;
  const segLen = cum[i + 1]! - cum[i]!;
  const t = segLen > 1e-6 ? (sc - cum[i]!) / segLen : 0;
  const ax = pts[i * 3]!;
  const az = pts[i * 3 + 2]!;
  const bx = pts[(i + 1) * 3]!;
  const bz = pts[(i + 1) * 3 + 2]!;
  out.x = ax + (bx - ax) * t;
  out.y = pts[i * 3 + 1]!;
  out.z = az + (bz - az) * t;
  return yawFromDir(bx - ax, bz - az);
}

/** Project (x,z) onto a lane; returns arc-length `s` of the closest point and squared distance. */
export function projectOntoLane(lane: Lane, x: number, z: number): { s: number; dist2: number } {
  const cum = lane.cum;
  const pts = lane.points;
  let bestS = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < cum.length - 1; i++) {
    const ax = pts[i * 3]!;
    const az = pts[i * 3 + 2]!;
    const bx = pts[(i + 1) * 3]!;
    const bz = pts[(i + 1) * 3 + 2]!;
    const dx = bx - ax;
    const dz = bz - az;
    const segLen2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / segLen2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = cum[i]! + t * Math.sqrt(segLen2);
    }
  }
  return { s: bestS, dist2: bestD2 };
}

/** Nearest lane to a world point (brute force; lane counts are modest). */
export function nearestLane(
  graph: LaneGraph,
  x: number,
  z: number,
): { lane: Lane; s: number } | null {
  let best: Lane | null = null;
  let bestD2 = Infinity;
  let bestS = 0;
  for (const lane of graph.lanes) {
    const { s, dist2 } = projectOntoLane(lane, x, z);
    if (dist2 < bestD2) {
      bestD2 = dist2;
      best = lane;
      bestS = s;
    }
  }
  return best ? { lane: best, s: bestS } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signals
// ─────────────────────────────────────────────────────────────────────────────
export function getLightPhaseForLane(graph: LaneGraph, laneId: number): LightPhase {
  const lane = graph.laneById.get(laneId);
  if (!lane || lane.intersectionId < 0) return "green";
  const inter = graph.intersectionById.get(lane.intersectionId);
  if (!inter) return "green";
  const served = inter.groups[inter.phase];
  if (served && served.indexOf(laneId) >= 0) return inter.yellow ? "yellow" : "green";
  return "red";
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing (A* over lanes; cost = lane length) — for wanted-police pursuit.
// ─────────────────────────────────────────────────────────────────────────────
export function planRoute(graph: LaneGraph, fromLaneId: number, toLaneId: number): number[] {
  if (fromLaneId === toLaneId) return [fromLaneId];
  const goal = graph.laneById.get(toLaneId);
  if (!graph.laneById.has(fromLaneId) || !goal) return [];
  const goalNode = graph.nodes.find((n) => n.id === goal.to);
  const h = (lane: Lane): number => {
    if (!goalNode) return 0;
    const dx = lane.midX - goalNode.x;
    const dz = lane.midZ - goalNode.z;
    return Math.hypot(dx, dz);
  };
  const open = new Set<number>([fromLaneId]);
  const cameFrom = new Map<number, number>();
  const g = new Map<number, number>([[fromLaneId, 0]]);
  const f = new Map<number, number>([[fromLaneId, h(graph.laneById.get(fromLaneId)!)]]);
  let guard = 0;
  const maxIter = graph.lanes.length * 4 + 64;
  while (open.size > 0 && guard++ < maxIter) {
    let current = -1;
    let bestF = Infinity;
    for (const id of open) {
      const fv = f.get(id) ?? Infinity;
      if (fv < bestF) {
        bestF = fv;
        current = id;
      }
    }
    if (current === toLaneId) {
      const path = [current];
      let c = current;
      while (cameFrom.has(c)) {
        c = cameFrom.get(c)!;
        path.push(c);
      }
      return path.reverse();
    }
    open.delete(current);
    const lane = graph.laneById.get(current)!;
    const gc = g.get(current) ?? Infinity;
    for (const nid of lane.successors) {
      const nlane = graph.laneById.get(nid);
      if (!nlane) continue;
      const tentative = gc + lane.length;
      if (tentative < (g.get(nid) ?? Infinity)) {
        cameFrom.set(nid, current);
        g.set(nid, tentative);
        f.set(nid, tentative + h(nlane));
        open.add(nid);
      }
    }
  }
  return [];
}

/** Intersection nodes reachable ahead of (x,z) heading `heading` — roadblock candidates. */
export function chokepointsAhead(
  graph: LaneGraph,
  x: number,
  z: number,
  heading: number,
  count: number,
): { x: number; z: number; node: number }[] {
  const out: { x: number; z: number; node: number }[] = [];
  const start = nearestLane(graph, x, z);
  if (!start) return out;
  let lane: Lane | undefined = start.lane;
  const seen = new Set<number>();
  let steps = 0;
  let wantHeading = heading;
  while (lane && out.length < count && steps++ < 40) {
    if (lane.intersectionId >= 0 && !seen.has(lane.to)) {
      const node = graph.nodes.find((n) => n.id === lane!.to);
      if (node) {
        out.push({ x: node.x, z: node.z, node: node.id });
        seen.add(lane.to);
      }
    }
    // Prefer the successor whose direction best matches our travel heading (keep going straight).
    let best: Lane | undefined;
    let bestDot = -Infinity;
    for (const sid of lane.successors) {
      const s = graph.laneById.get(sid);
      if (!s) continue;
      const hx = s.points[3]! - s.points[0]!;
      const hz = s.points[5]! - s.points[2]!;
      const yaw = yawFromDir(hx, hz);
      const dot = Math.cos(yaw - wantHeading);
      if (dot > bestDot) {
        bestDot = dot;
        best = s;
        wantHeading = yaw;
      }
    }
    lane = best;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural fallback — a downtown Manhattan grid centred on the origin.
// ─────────────────────────────────────────────────────────────────────────────
export function proceduralRoads(cols = 13, rows = 13, spacing = 44): RoadGraphInput {
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const id = (c: number, r: number): number => r * cols + c;
  const ox = -((cols - 1) * spacing) / 2;
  const oz = -((rows - 1) * spacing) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: id(c, r), x: ox + c * spacing, z: oz + r * spacing });
    }
  }
  const klassFor = (i: number): RoadClass => (i % 4 === 0 ? "avenue" : "street");
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) edges.push({ from: id(c, r), to: id(c + 1, r), klass: klassFor(r) });
      if (r < rows - 1) edges.push({ from: id(c, r), to: id(c, r + 1), klass: klassFor(c) });
    }
  }
  return { nodes, edges };
}
