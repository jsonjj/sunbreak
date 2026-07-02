// ─────────────────────────────────────────────────────────────────────────────
// The app-wide BLIP + WAYPOINT API — the key hook every other subsystem calls to
// populate the minimap + full map. Import the plain functions:
//
//   import { addBlip, removeBlip, setWaypoint } from "@/systems/ui/menu-hud";
//
//   const id = addBlip({ id: "shop:ironworks", worldPos: { x, z }, kind: "shop", label: "Ironworks" });
//   addBlip({ id, worldPos: newPos });   // re-call to move / restyle (upsert)
//   removeBlip("shop:ironworks");
//   setWaypoint({ x, z });               // or setWaypoint(null) to clear
//
// Entity-attached blips (vehicles, police, peds) can instead tag the ECS `hud_blip` component and
// the minimap/map read their live transform automatically (see ../hud.components.ts).
//
// Reactivity model (perf): the `blips` Map keeps a STABLE reference. Position upserts mutate blip
// objects in place (the canvas RAF reads them via getState() — zero React churn); structural
// add/remove bumps `blipVersion` so React consumers (legend, layer toggles) re-render.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { ROUTE_DEVIATION_M, ZOOM_MAX_M, ZOOM_METERS, ZOOM_MIN_M, layerOf } from "./palette";
import { clamp, dist, distToPolyline } from "./geometry";
import { computeRoute } from "./route";
import { readPlayerCam } from "./playerCam";
import { normalizeWorldPos } from "./types";
import type { BlipInput, BlipLayer, MapBlip, RouteResult, Vec2, WorldPos } from "./types";

export interface MapLayerVisibility {
  mission: boolean;
  shop: boolean;
  activity: boolean;
  vehicle: boolean;
  police: boolean;
}

export interface HudMapState {
  // blips
  blips: Map<string, MapBlip>; // stable reference
  blipVersion: number; // bumps on structural (add/remove) change only

  // waypoint / route
  waypoint: Vec2 | null;
  waypointLabel: string | null;
  route: RouteResult | null;
  routeVersion: number; // bumps when the route polyline is replaced

  // view prefs (minimap + map)
  northUp: boolean;
  autoZoom: boolean;
  zoomMeters: number; // manual minimap radius (world m) when autoZoom is off
  layers: MapLayerVisibility;
  selectedId: string | null;

  // ── internal actions (the public API below wraps these) ──
  _upsert: (b: MapBlip) => void;
  _remove: (id: string) => void;
  _clear: (filter?: (b: MapBlip) => boolean) => void;
  _setWaypoint: (at: Vec2 | null, label: string | null) => void;
  _setRoute: (r: RouteResult | null) => void;

  setNorthUp: (v: boolean) => void;
  toggleNorthUp: () => void;
  setAutoZoom: (v: boolean) => void;
  setZoomMeters: (m: number) => void;
  toggleLayer: (layer: BlipLayer, v?: boolean) => void;
  setSelected: (id: string | null) => void;
}

export const useHudMapStore = create<HudMapState>()(
  subscribeWithSelector((set, get) => ({
    blips: new Map<string, MapBlip>(),
    blipVersion: 0,

    waypoint: null,
    waypointLabel: null,
    route: null,
    routeVersion: 0,

    northUp: false,
    autoZoom: true,
    zoomMeters: ZOOM_METERS.drive,
    layers: { mission: true, shop: true, activity: true, vehicle: true, police: true },
    selectedId: null,

    _upsert: (b) => {
      const map = get().blips;
      const cur = map.get(b.id);
      if (cur) {
        // In-place mutation → no re-render; the RAF loop reads live values.
        cur.x = b.x;
        cur.z = b.z;
        cur.y = b.y;
        cur.kind = b.kind;
        cur.color = b.color;
        cur.label = b.label;
        cur.waypointable = b.waypointable;
        cur.minimap = b.minimap;
        cur.map = b.map;
        cur.clampToEdge = b.clampToEdge;
        cur.priority = b.priority;
        cur.sonar = b.sonar;
      } else {
        map.set(b.id, b);
        set({ blipVersion: get().blipVersion + 1 });
      }
    },
    _remove: (id) => {
      const map = get().blips;
      if (map.delete(id)) {
        const patch: Partial<HudMapState> = { blipVersion: get().blipVersion + 1 };
        if (get().selectedId === id) patch.selectedId = null;
        set(patch);
      }
    },
    _clear: (filter) => {
      const map = get().blips;
      let changed = false;
      for (const [id, b] of map) {
        if (!filter || filter(b)) {
          map.delete(id);
          changed = true;
        }
      }
      if (changed) set({ blipVersion: get().blipVersion + 1 });
    },
    _setWaypoint: (at, label) => set({ waypoint: at, waypointLabel: label }),
    _setRoute: (r) => set({ route: r, routeVersion: get().routeVersion + 1 }),

    setNorthUp: (v) => set({ northUp: v }),
    toggleNorthUp: () => set({ northUp: !get().northUp }),
    setAutoZoom: (v) => set({ autoZoom: v }),
    setZoomMeters: (m) => set({ zoomMeters: clamp(m, ZOOM_MIN_M, ZOOM_MAX_M) }),
    toggleLayer: (layer, v) => set((s) => ({ layers: { ...s.layers, [layer]: v ?? !s.layers[layer] } })),
    setSelected: (id) => set({ selectedId: id }),
  })),
);

/** Non-hook read for RAF loops / systems (avoids subscribing). */
export const getHudMapState = useHudMapStore.getState;

// ── Public BLIP API ─────────────────────────────────────────────────────────────

function normalize(input: BlipInput): MapBlip {
  const p = normalizeWorldPos(input.worldPos);
  const kind = input.kind ?? input.icon ?? "poi";
  return {
    id: input.id,
    x: p.x,
    z: p.z,
    y: input.height ?? p.y,
    kind,
    color: input.color,
    label: input.label,
    waypointable: input.waypointable ?? true,
    minimap: input.minimap ?? true,
    map: input.map ?? true,
    clampToEdge: input.clampToEdge ?? true,
    priority: input.priority ?? 0,
    sonar: input.sonar ?? false,
  };
}

/** Add or update (upsert) a blip. Returns its id. Safe to call every frame to move a blip. */
export function addBlip(input: BlipInput): string {
  getHudMapState()._upsert(normalize(input));
  return input.id;
}

/** Remove a blip by id. No-op if it doesn't exist. */
export function removeBlip(id: string): void {
  getHudMapState()._remove(id);
}

/** Patch an existing blip (kind/color/label/position/flags). No-op if it doesn't exist. */
export function updateBlip(id: string, patch: Partial<Omit<BlipInput, "id">>): void {
  const cur = getHudMapState().blips.get(id);
  if (!cur) return;
  const pos = patch.worldPos ? normalizeWorldPos(patch.worldPos) : undefined;
  getHudMapState()._upsert({
    ...cur,
    ...(pos ? { x: pos.x, z: pos.z, y: patch.height ?? pos.y } : {}),
    ...(patch.kind || patch.icon ? { kind: (patch.kind ?? patch.icon)! } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.waypointable !== undefined ? { waypointable: patch.waypointable } : {}),
    ...(patch.minimap !== undefined ? { minimap: patch.minimap } : {}),
    ...(patch.map !== undefined ? { map: patch.map } : {}),
    ...(patch.clampToEdge !== undefined ? { clampToEdge: patch.clampToEdge } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.sonar !== undefined ? { sonar: patch.sonar } : {}),
  });
}

/** Move an existing blip. Convenience for entities not on the ECS `hud_blip` channel. */
export function updateBlipPosition(id: string, worldPos: WorldPos): void {
  const cur = getHudMapState().blips.get(id);
  if (!cur) return;
  const p = normalizeWorldPos(worldPos);
  cur.x = p.x;
  cur.z = p.z;
  if (p.y !== undefined) cur.y = p.y;
}

/** Remove every blip, or every blip matching `filter`. */
export function clearBlips(filter?: (b: MapBlip) => boolean): void {
  getHudMapState()._clear(filter);
}

/** Set (or clear, with `null`) the route waypoint. Recomputes the GPS route immediately. */
export function setWaypoint(worldPos: WorldPos | null, label?: string): void {
  if (worldPos == null) {
    getHudMapState()._setWaypoint(null, null);
    getHudMapState()._setRoute(null);
    return;
  }
  const p = normalizeWorldPos(worldPos);
  getHudMapState()._setWaypoint({ x: p.x, z: p.z }, label ?? null);
  recomputeRoute();
}

/** Clear the waypoint + route. */
export function clearWaypoint(): void {
  setWaypoint(null);
}

/** The current waypoint (world `{x,z}`), or null. */
export function getWaypoint(): Vec2 | null {
  return getHudMapState().waypoint;
}

export function hasWaypoint(): boolean {
  return getHudMapState().waypoint != null;
}

// ── Route ticking (called from the minimap RAF) ──────────────────────────────────

let routeAccum = 0;
const ROUTE_INTERVAL_S = 0.6;

/** Recompute the route from the live player position to the waypoint. */
export function recomputeRoute(): void {
  const st = getHudMapState();
  const wp = st.waypoint;
  if (!wp) {
    if (st.route) st._setRoute(null);
    return;
  }
  const cam = readPlayerCam();
  if (!cam.valid) return;
  st._setRoute(computeRoute({ x: cam.x, z: cam.z }, wp));
}

/**
 * Throttled route refresh — recompute on a cadence, or immediately when the player strays off the
 * drawn line. Cheap (memoised A*), so the minimap can call this every frame.
 */
export function tickRoute(dt: number): void {
  const st = getHudMapState();
  const wp = st.waypoint;
  if (!wp) {
    routeAccum = 0;
    return;
  }
  routeAccum += dt;
  const cam = readPlayerCam();
  const strayed =
    cam.valid &&
    st.route != null &&
    st.route.path.length > 1 &&
    distToPolyline(cam.x, cam.z, st.route.path) > ROUTE_DEVIATION_M;

  // Also auto-clear the waypoint once the player basically arrives.
  if (cam.valid && dist(cam.x, cam.z, wp.x, wp.z) < 6) {
    setWaypoint(null);
    return;
  }

  if (routeAccum >= ROUTE_INTERVAL_S || strayed) {
    routeAccum = 0;
    recomputeRoute();
  }
}

/** Group a blip's kind into a full-map toggle layer (waypoint/player → null = always shown). */
export { layerOf } from "./palette";
