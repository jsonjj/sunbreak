// Routing at lane ends: choose a successor lane (weighted toward going straight, with variety) and
// advance a car across lane boundaries when it passes the end of its current lane.
import { angleDelta, yawFromDir } from "./math";
import type { Rng } from "./prng";
import type { Lane, LaneGraph, TrafficCar } from "./types";

function laneEndHeading(lane: Lane): number {
  const p = lane.points;
  const n = p.length;
  return yawFromDir(p[n - 3]! - p[n - 6]!, p[n - 1]! - p[n - 4]!);
}
function laneStartHeading(lane: Lane): number {
  const p = lane.points;
  return yawFromDir(p[3]! - p[0]!, p[5]! - p[2]!);
}

/** Weighted-random successor of `lane`, biased to keep heading. Returns a lane id or -1. */
export function pickSuccessor(graph: LaneGraph, lane: Lane, rng: Rng): number {
  const succ = lane.successors;
  if (succ.length === 0) return -1;
  if (succ.length === 1) return succ[0]!;
  const endH = laneEndHeading(lane);
  let total = 0;
  // Two-pass weighted sample without allocation.
  for (const sid of succ) {
    const s = graph.laneById.get(sid);
    if (!s) continue;
    const d = Math.abs(angleDelta(endH, laneStartHeading(s)));
    total += 0.12 + Math.max(0, Math.cos(d)); // straight ≈ 1.12, sharp turn ≈ 0.12
  }
  let r = rng() * total;
  for (const sid of succ) {
    const s = graph.laneById.get(sid);
    if (!s) continue;
    const d = Math.abs(angleDelta(endH, laneStartHeading(s)));
    r -= 0.12 + Math.max(0, Math.cos(d));
    if (r <= 0) return sid;
  }
  return succ[succ.length - 1]!;
}

/**
 * Move a car forward across lane boundaries once `s` exceeds the current lane length.
 * Returns false when the car dead-ends (caller should recycle it).
 */
export function advanceLane(graph: LaneGraph, car: TrafficCar, rng: Rng): boolean {
  let guard = 0;
  while (guard++ < 4) {
    const lane = graph.laneById.get(car.laneId);
    if (!lane) return false;
    if (car.s < lane.length) return true;
    if (car.nextLane < 0) return false;
    const next = graph.laneById.get(car.nextLane);
    if (!next) return false;
    car.s -= lane.length;
    car.laneId = next.id;
    car.classId = next.classId;
    car.nextLane = pickSuccessor(graph, next, rng);
  }
  return true;
}
