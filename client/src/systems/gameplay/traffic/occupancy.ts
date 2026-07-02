// Per-lane occupancy: cars bucketed by lane and kept sorted by arc-length `s`, giving O(1)-ish
// lead-vehicle lookup for IDM car-following. We REBUILD the index once per fixed tick (n <= ~160,
// so an O(n log n) rebuild is trivial and far less bug-prone than incremental move/insert/remove).
import type { ClientEntity } from "@/ecs/clientEntity";
import type { LaneGraph } from "./types";

const LOOKAHEAD = 70; // metres: ignore leads further than this (free road)

const byLane = new Map<number, ClientEntity[]>();

export function rebuildOccupancy(cars: readonly ClientEntity[]): void {
  for (const list of byLane.values()) list.length = 0;
  for (const e of cars) {
    const c = e.traffic_car;
    if (!c) continue;
    const list = byLane.get(c.laneId);
    if (list) list.push(e);
    else byLane.set(c.laneId, [e]);
  }
  for (const list of byLane.values()) {
    if (list.length > 1) list.sort((a, b) => a.traffic_car!.s - b.traffic_car!.s);
  }
}

export function laneCars(laneId: number): ClientEntity[] | undefined {
  return byLane.get(laneId);
}

/** True if any car sits within [s0, s1] on `laneId` (spawn clearance + junction-box checks). */
export function laneHasCarBetween(laneId: number, s0: number, s1: number): boolean {
  const list = byLane.get(laneId);
  if (!list) return false;
  for (const e of list) {
    const s = e.traffic_car!.s;
    if (s >= s0 && s <= s1) return true;
  }
  return false;
}

/** Bumper-to-bumper gap + speed of the nearest obstacle ahead of `entity` (same lane, then next). */
export function leadGap(
  graph: LaneGraph,
  entity: ClientEntity,
): { gap: number; leadSpeed: number } | null {
  const c = entity.traffic_car!;
  const lane = graph.laneById.get(c.laneId);
  if (!lane) return null;
  const list = byLane.get(c.laneId);

  // Same lane: smallest s strictly ahead of us.
  let lead: ClientEntity | null = null;
  let leadS = Infinity;
  if (list) {
    for (const e of list) {
      if (e === entity) continue;
      const s = e.traffic_car!.s;
      if (s > c.s && s < leadS) {
        leadS = s;
        lead = e;
      }
    }
  }
  if (lead) {
    const lc = lead.traffic_car!;
    const gap = leadS - c.s - (c.length + lc.length) * 0.5;
    return { gap: Math.max(0.05, gap), leadSpeed: lc.speed };
  }

  // Spill into the chosen successor lane (so cars slow for a queue across the junction).
  if (c.nextLane >= 0) {
    const nlist = byLane.get(c.nextLane);
    if (nlist && nlist.length > 0) {
      let first: ClientEntity | null = null;
      let firstS = Infinity;
      for (const e of nlist) {
        const s = e.traffic_car!.s;
        if (s < firstS) {
          firstS = s;
          first = e;
        }
      }
      if (first) {
        const lc = first.traffic_car!;
        const gap = lane.length - c.s + firstS - (c.length + lc.length) * 0.5;
        if (gap < LOOKAHEAD) return { gap: Math.max(0.05, gap), leadSpeed: lc.speed };
      }
    }
  }
  return null;
}

export function clearOccupancy(): void {
  byLane.clear();
}
