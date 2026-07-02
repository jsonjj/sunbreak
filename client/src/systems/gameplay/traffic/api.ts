// Public API — the traffic subsystem's surface for other subsystems + the integrator. Everything is
// loosely coupled: consumers call these functions; producers register providers. Nothing here
// imports another agent's in-flight folder.
import type { Vec3, VehicleId } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { SPAWN_INNER, SPAWN_OUTER } from "./config";
import { trafficEvents } from "./events";
import {
  chokepointsAhead,
  getLightPhaseForLane,
  nearestLane,
  planRoute as planRouteGraph,
} from "./laneGraph";
import { recycleAllCars, stripTrafficComponents } from "./lifecycle";
import { offscreen, state } from "./state";
import { trafficQuery } from "./traffic.components";
import type { CarjackSpec, LightPhase, RoadGraphInput } from "./types";

export { trafficEvents };
export type { CarjackSpec, RoadGraphInput, RoadEdge, RoadNode, LaneGraph, TrafficCar } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Providers (integrator / producer subsystems wire these once)
// ─────────────────────────────────────────────────────────────────────────────
/** City-Gen (render/city) hands us its road graph; we flush ambient cars + (re)derive the lane
 *  graph next tick so stale lane ids from any prior (e.g. procedural) graph can't linger. */
export function provideRoadNetwork(roads: RoadGraphInput): void {
  recycleAllCars();
  state.providedRoads = roads;
  state.graph = null;
  state.ready = false;
}
/** wanted-police: current wanted level 0..5. */
export function provideWanted(fn: () => number): void {
  state.providers.wanted = fn;
}
/** wanted-police: "is a siren near (x,z)?" for pull-over / scatter. */
export function provideSirenNear(fn: (x: number, z: number) => boolean): void {
  state.providers.sirenNear = fn;
}
/** vehicle-gameplay: optional spawner invoked on carjack (ECS handoff works without it). */
export function provideVehicleSpawner(fn: (spec: CarjackSpec) => void): void {
  state.providers.spawnVehicle = fn;
}
/** wanted-police: optional crime reporter for player-caused crashes. */
export function provideCrimeReporter(fn: (x: number, z: number, kind: string) => void): void {
  state.providers.reportCrime = fn;
}

/** Test/integrator hook: run the sim without a mounted <TrafficView/> (no render/physics). */
export function setHeadless(on: boolean): void {
  state.forceHeadless = on;
}

// ─────────────────────────────────────────────────────────────────────────────
// For pedestrian-ai
// ─────────────────────────────────────────────────────────────────────────────
export interface NearbyVehicle {
  pos: Vec3;
  vel: Vec3;
  speed: number;
  id: number | undefined;
}

/** Ambient vehicles within radius `r` of (x,z) — positions + velocities for ped avoidance. */
export function getVehiclesNear(x: number, z: number, r: number): NearbyVehicle[] {
  const out: NearbyVehicle[] = [];
  const r2 = r * r;
  for (const e of trafficQuery.entities) {
    const t = e.transform;
    const c = e.traffic_car;
    if (!t || !c) continue;
    const dx = t.position.x - x;
    const dz = t.position.z - z;
    if (dx * dx + dz * dz > r2) continue;
    const v = e.velocity?.linear ?? { x: 0, y: 0, z: 0 };
    out.push({
      pos: { x: t.position.x, y: t.position.y, z: t.position.z },
      vel: { x: v.x, y: v.y, z: v.z },
      speed: c.speed,
      id: world.id(e),
    });
  }
  return out;
}

/** Signal phase for a specific lane (crosswalk coordination). */
export function getLightPhase(laneId: number): LightPhase {
  return state.graph ? getLightPhaseForLane(state.graph, laneId) : "green";
}

/** Signal phase at a world point (nearest lane). */
export function getLightPhaseAt(x: number, z: number): LightPhase {
  if (!state.graph) return "green";
  const near = nearestLane(state.graph, x, z);
  return near ? getLightPhaseForLane(state.graph, near.lane.id) : "green";
}

// ─────────────────────────────────────────────────────────────────────────────
// For wanted-police
// ─────────────────────────────────────────────────────────────────────────────
/** A* lane route (lane ids) between two lanes. */
export function planRoute(fromLaneId: number, toLaneId: number): number[] {
  return state.graph ? planRouteGraph(state.graph, fromLaneId, toLaneId) : [];
}

/** A* lane route between two world points; returns lane ids. */
export function planRouteFromTo(x1: number, z1: number, x2: number, z2: number): number[] {
  const g = state.graph;
  if (!g) return [];
  const a = nearestLane(g, x1, z1);
  const b = nearestLane(g, x2, z2);
  return a && b ? planRouteGraph(g, a.lane.id, b.lane.id) : [];
}

/** Intersection nodes ahead of (x,z) travelling `heading` — roadblock/chokepoint candidates. */
export function getChokepointsAhead(
  x: number,
  z: number,
  heading: number,
  count = 3,
): { x: number; z: number; node: number }[] {
  return state.graph ? chokepointsAhead(state.graph, x, z, heading, count) : [];
}

/** An off-screen graph node in the spawn annulus (police unit spawn point). */
export function getSpawnNodeOffscreen(): { x: number; z: number; node: number } | null {
  const g = state.graph;
  if (!g) return null;
  const cx = state.view.px;
  const cz = state.view.pz;
  const inner2 = SPAWN_INNER * SPAWN_INNER;
  const outer2 = SPAWN_OUTER * SPAWN_OUTER;
  let chosen: { x: number; z: number; node: number } | null = null;
  let acc = 0;
  for (const n of g.nodes) {
    const dx = n.x - cx;
    const dz = n.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < inner2 || d2 > outer2) continue;
    if (!offscreen(n.x, n.z)) continue;
    acc += 1;
    if (state.rng() * acc < 1) chosen = { x: n.x, z: n.z, node: n.id };
  }
  return chosen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carjack handoff → vehicle-gameplay (via SHARED ECS components on the same entity)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hand an ambient car to vehicle-gameplay. The SAME entity is kept (so its transform, velocity and
 * THREE model carry over with zero pop): traffic ownership is stripped and the shared `vehicle` +
 * `isVehicle` + `traffic_promoted` components are stamped on. vehicle-gameplay adopts it via
 * `world.with("traffic_promoted","vehicle")` (or registers `provideVehicleSpawner`). Returns the
 * spec, or null if `entity` isn't an ambient car.
 */
export function promoteToDrivable(entity: ClientEntity): CarjackSpec | null {
  const car = entity.traffic_car;
  if (!car || !entity.transform) return null;
  const vlin = entity.velocity?.linear ?? { x: 0, y: 0, z: 0 };
  const spec: CarjackSpec = {
    entityId: world.id(entity),
    vehicleId: car.vehicleId,
    transform: {
      position: { ...entity.transform.position },
      rotation: { ...entity.transform.rotation },
    },
    velocity: { x: vlin.x, y: vlin.y, z: vlin.z },
    colorHex: car.colorHex,
    classId: car.classId,
    speedKmh: car.speed * 3.6,
  };

  const vehicleId: VehicleId = car.vehicleId;
  stripTrafficComponents(entity);
  if (!entity.vehicle) {
    world.addComponent(entity, "vehicle", {
      id: vehicleId,
      seats: 4,
      occupants: [],
      engineOn: false,
      speedKmh: spec.speedKmh,
    });
  }
  if (!entity.isVehicle) world.addComponent(entity, "isVehicle", true);
  if (!entity.traffic_promoted) world.addComponent(entity, "traffic_promoted", true);
  if (!entity.traffic_vehicleId) world.addComponent(entity, "traffic_vehicleId", vehicleId);

  state.providers.spawnVehicle?.(spec);
  trafficEvents.emit("carjack", spec);
  return spec;
}

/** Nearest carjackable ambient car to (x,z) within `r`, for interaction prompts. */
export function nearestCarjackable(x: number, z: number, r: number): ClientEntity | null {
  let best: ClientEntity | null = null;
  let bestD2 = r * r;
  for (const e of trafficQuery.entities) {
    if (!e.traffic_carjackable || !e.transform || e.traffic_car?.dynamic) continue;
    const dx = e.transform.position.x - x;
    const dz = e.transform.position.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Introspection (debug / integrator)
// ─────────────────────────────────────────────────────────────────────────────
export function getTrafficInfo(): {
  ready: boolean;
  source: string;
  lanes: number;
  intersections: number;
  cars: number;
  capScale: number;
} {
  return {
    ready: state.ready,
    source: state.graphSource,
    lanes: state.graph?.lanes.length ?? 0,
    intersections: state.graph?.intersections.length ?? 0,
    cars: trafficQuery.entities.length,
    capScale: state.governor.capScale,
  };
}
