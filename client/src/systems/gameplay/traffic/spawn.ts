// Density-driven spawn/despawn "bubble" around the player. New cars appear in an off-screen annulus
// (so they never pop in on-camera) with a bumper-gap clearance check; cars beyond the despawn
// radius are recycled once off-screen. Cap scales with quality tier × the adaptive governor.
import { useQuality } from "@/render/quality/useQuality";
import { isBuildingAt } from "@/systems/render/city/occupancy";
import type { ClientEntity } from "@/ecs/clientEntity";
import { CAPS, DESPAWN_RADIUS, SPAWN_INNER, SPAWN_OUTER, SPAWN_PER_TICK } from "./config";
import { sampleLane } from "./laneGraph";
import { laneHasCarBetween } from "./occupancy";
import { randRange } from "./prng";
import { spawnCarAt, recycleCar } from "./lifecycle";
import { offscreen, state } from "./state";
import type { Lane, LaneGraph } from "./types";

const spawnScratch = { x: 0, y: 0, z: 0 };

const INNER2 = SPAWN_INNER * SPAWN_INNER;
const OUTER2 = SPAWN_OUTER * SPAWN_OUTER;
const DESPAWN2 = DESPAWN_RADIUS * DESPAWN_RADIUS;

/** Reservoir-sample one lane in the spawn annulus (weighted by length), offscreen only. */
function pickSpawnLane(graph: LaneGraph, cx: number, cz: number): Lane | null {
  const rng = state.rng;
  let chosen: Lane | null = null;
  let acc = 0;
  for (const lane of graph.lanes) {
    if (lane.length < 6) continue;
    const dx = lane.midX - cx;
    const dz = lane.midZ - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < INNER2 || d2 > OUTER2) continue;
    if (!offscreen(lane.midX, lane.midZ)) continue;
    acc += lane.length;
    if (rng() * acc < lane.length) chosen = lane;
  }
  return chosen;
}

function qualityCap(): number {
  const tier = useQuality.getState().tier;
  return Math.max(8, Math.floor(CAPS[tier] * state.governor.capScale));
}

export function maintainDensity(graph: LaneGraph, cars: readonly ClientEntity[], cx: number, cz: number): void {
  const cap = qualityCap();
  let count = cars.length;
  if (count >= cap) return;
  let made = 0;
  let attempts = SPAWN_PER_TICK * 4;
  while (count < cap && made < SPAWN_PER_TICK && attempts-- > 0) {
    const lane = pickSpawnLane(graph, cx, cz);
    if (!lane) continue;
    const s = randRange(state.rng, 2, lane.length - 2);
    const clearance = 9;
    if (laneHasCarBetween(lane.id, s - clearance, s + clearance)) continue;
    // Defensive: never spawn a car inside a building footprint (lanes ARE the city roads, so this
    // rarely triggers, but it guarantees cars start on the road, not clipped into a wall).
    sampleLane(lane, s, spawnScratch);
    if (isBuildingAt(spawnScratch.x, spawnScratch.z, 1.5)) continue;
    spawnCarAt(graph, lane, s);
    count++;
    made++;
  }
}

export function despawnFar(cars: readonly ClientEntity[], cx: number, cz: number): void {
  // Iterate a snapshot copy so recycling (which mutates the query array) can't skip entities.
  for (let i = cars.length - 1; i >= 0; i--) {
    const e = cars[i];
    if (!e) continue;
    const t = e.transform;
    if (!t) continue;
    const dx = t.position.x - cx;
    const dz = t.position.z - cz;
    if (dx * dx + dz * dz > DESPAWN2 && offscreen(t.position.x, t.position.z)) {
      recycleCar(e);
    }
  }
}
