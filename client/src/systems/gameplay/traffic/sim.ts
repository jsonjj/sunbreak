// System orchestrator. Two systems self-registered by index.ts:
//   • trafficUpdateSystem (phase "update") — lazily builds the lane graph, then runs the fixed 30 Hz
//     sim via an accumulator: spawn/despawn (throttled) → occupancy → signals → reactions → driving →
//     LOD. Pause-gated on game.phase and fully inert until <TrafficView/> is mounted.
//   • trafficRenderSystem (phase "render") — copies each car's sim transform into its THREE object
//     with sub-tick extrapolation for smooth 60 fps, and feeds the adaptive governor.
import type { System } from "@sunbreak/shared";
import type { World } from "miniplex";
import { useGameStore } from "@/stores/game.store";
import type { ClientEntity } from "@/ecs/clientEntity";
import { MAX_SUBSTEPS, SIM_DT, SPAWN_HZ } from "./config";
import { driveCars, updateIntersections } from "./driving";
import { trafficEvents } from "./events";
import { buildLaneGraph, proceduralRoads } from "./laneGraph";
import { tickGovernor, updateLod } from "./lod";
import { rebuildOccupancy } from "./occupancy";
import { updatePoliceReactions } from "./reactions";
import { despawnFar, maintainDensity } from "./spawn";
import { playerEntity, state } from "./state";
import { trafficQuery, trafficRenderQuery } from "./traffic.components";
import type { RoadGraphInput } from "./types";

type W = World<ClientEntity>;

const SPAWN_INTERVAL = 1 / SPAWN_HZ;
let prevPx = 0;
let prevPz = 0;
let havePrev = false;

/** Attempt to discover a City-Gen road graph on a well-known global (belt-and-suspenders; the
 *  primary path is `provideRoadNetwork()`). Never throws. */
function discoverRoads(): RoadGraphInput | null {
  try {
    const g = globalThis as unknown as {
      __SUNBREAK_CITY__?: { getRoadGraph?: () => unknown; roadGraph?: unknown };
    };
    const src = g.__SUNBREAK_CITY__;
    const rg = (src?.getRoadGraph ? src.getRoadGraph() : src?.roadGraph) as RoadGraphInput | undefined;
    if (rg && Array.isArray(rg.nodes) && Array.isArray(rg.edges) && rg.nodes.length > 1) return rg;
  } catch {
    /* ignore */
  }
  return null;
}

function ensureGraph(): boolean {
  if (state.graph) return true;
  let source: RoadGraphInput | null = state.providedRoads;
  let kind: "provided" | "discovered" | "procedural" = "provided";
  if (!source) {
    source = discoverRoads();
    kind = source ? "discovered" : "procedural";
  }
  if (!source) source = proceduralRoads();
  const graph = buildLaneGraph(source);
  if (graph.lanes.length === 0) return false;
  state.graph = graph;
  state.graphSource = kind;
  state.ready = true;
  trafficEvents.emit("graphReady", {
    lanes: graph.lanes.length,
    intersections: graph.intersections.length,
    source: kind,
  });
  return true;
}

function tick(dt: number): void {
  const graph = state.graph!;
  const cars = trafficQuery.entities;

  state.spawnClock += dt;
  const pe = playerEntity();
  if (pe?.transform && state.spawnClock >= SPAWN_INTERVAL) {
    state.spawnClock = 0;
    const cx = state.view.px;
    const cz = state.view.pz;
    maintainDensity(graph, cars, cx, cz);
    despawnFar(cars, cx, cz);
  }

  rebuildOccupancy(cars);
  updateIntersections(graph, dt);
  updatePoliceReactions(cars);
  driveCars(graph, cars, dt);
  updateLod(cars);
}

export const trafficUpdateSystem: System<W> = {
  name: "traffic/update",
  phase: "update",
  order: 20,
  fn: (_w, dt) => {
    if (!state.isActive()) return;
    if (useGameStore.getState().phase !== "playing") return;
    if (!ensureGraph()) return;

    // Refresh the player-centred view fields (camera fields are written by the bridge).
    const pe = playerEntity();
    if (pe?.transform) {
      const p = pe.transform.position;
      if (havePrev && dt > 1e-4) {
        state.view.pvx = (p.x - prevPx) / dt;
        state.view.pvz = (p.z - prevPz) / dt;
      }
      prevPx = p.x;
      prevPz = p.z;
      havePrev = true;
      state.view.px = p.x;
      state.view.py = p.y;
      state.view.pz = p.z;
    }

    state.accumulator += dt < 0.1 ? dt : 0.1; // clamp long stalls
    let steps = 0;
    while (state.accumulator >= SIM_DT && steps < MAX_SUBSTEPS) {
      tick(SIM_DT);
      state.accumulator -= SIM_DT;
      steps++;
    }
    if (steps >= MAX_SUBSTEPS) state.accumulator = 0; // no spiral of death
    state.alpha = state.accumulator / SIM_DT;
  },
};

export const trafficRenderSystem: System<W> = {
  name: "traffic/render",
  phase: "render",
  order: 20,
  fn: (_w, dt) => {
    tickGovernor(dt);
    if (!state.isActive() || !state.graph) return;
    const alpha = state.alpha;
    for (const e of trafficRenderQuery.entities) {
      const c = e.traffic_car;
      const t = e.transform;
      const o = e.three;
      if (!c || !t || !o) continue;
      let ex = 0;
      let ez = 0;
      if (!c.dynamic) {
        const step = c.speed * alpha * SIM_DT;
        ex = Math.sin(c.headingY) * step;
        ez = Math.cos(c.headingY) * step;
      }
      o.position.set(t.position.x + ex, t.position.y, t.position.z + ez);
      o.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
      o.visible = c.lod < 3;
    }
  },
};
