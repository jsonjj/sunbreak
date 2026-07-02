// GPS routing driver (main thread). The canon spec routes in a Comlink Web Worker, but `comlink`
// is NOT pre-installed this wave (see report) — so we build the graph once and run the hand-rolled
// A* synchronously. The authored city is small (~180 nodes) so a search is well under a frame; the
// pure `findRoute` is worker-ready if a worker dep is added later.
import { buildRoadGraph, findRoute, type RoadGraph } from "../roadGraph";
import { SANTA_VISTA_MAP } from "../mapData";
import { getMapState } from "../mapStore";
import { readPlayerCam } from "../playerSource";
import { distToPolyline } from "../coords";
import { ROUTE_DEVIATION_M, ROUTE_RECHECK_S } from "../mapConstants";

let graph: RoadGraph | null = null;

export function getGraph(): RoadGraph {
  if (!graph) graph = buildRoadGraph(SANTA_VISTA_MAP.roads);
  return graph;
}

/** Prebuild the nav-graph so the first route request is instant. */
export function initRouter(): void {
  getGraph();
}

/** Recompute the route from the live player position to the active waypoint (writes the store). */
export function recomputeRoute(): void {
  const st = getMapState();
  const wp = st.waypoint;
  if (!wp) {
    if (st.route) st.setRoute(null);
    return;
  }
  const cam = readPlayerCam();
  if (!cam.valid) return;
  const result = findRoute(getGraph(), { x: cam.x, z: cam.z }, wp);
  st.setRoute(result);
}

let recheck = 0;

/** Called each update tick: recompute on waypoint change, or when the player leaves the line. */
export function tickRouting(dt: number): void {
  const st = getMapState();

  if (st.consumeRouteDirty()) {
    recompute();
    recheck = 0;
    return;
  }

  const wp = st.waypoint;
  const route = st.route;
  if (!wp || !route || !route.ok || route.path.length < 2) return;

  recheck -= dt;
  if (recheck > 0) return;
  recheck = ROUTE_RECHECK_S;

  const cam = readPlayerCam();
  if (!cam.valid) return;
  if (distToPolyline(cam.x, cam.z, route.path) > ROUTE_DEVIATION_M) recompute();
}

// Local alias so the dirty-path and deviation-path share one implementation.
function recompute(): void {
  recomputeRoute();
}
