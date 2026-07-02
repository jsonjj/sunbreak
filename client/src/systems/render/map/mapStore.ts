// The blip / waypoint / route / view store — the app-wide map API other systems talk to.
//
// Reactivity model (perf): the `blips` Map keeps a STABLE reference. Per-frame position updates
// mutate blip objects in place (no React churn — the canvas RAF reads them directly via
// `getState()`), while structural add/remove bumps `blipVersion` so React consumers (legend,
// layer toggles) re-render. Other subsystems: `import { useMapStore } from "@/systems/render/map"`.
import { create } from "zustand";
import { ZOOM_METERS, ZOOM_MAX_M, ZOOM_MIN_M } from "./mapConstants";
import { mapEvents } from "./events";
import { clamp } from "./coords";
import type { Blip, BlipLayer, RouteResult, Vec2 } from "./mapTypes";

export interface MapLayerVisibility {
  enemy: boolean;
  police: boolean;
  vehicle: boolean;
  poi: boolean;
  friend: boolean;
  mission: boolean;
}

export interface MapState {
  // view / mode
  fullscreenOpen: boolean;
  northUp: boolean;
  autoZoom: boolean;
  /** Manual minimap radius (world m) used when `autoZoom` is off. */
  zoomMeters: number;

  // accessibility / settings
  opacity: number; // 0..1
  scale: number; // HUD scale multiplier
  colorBlind: boolean;

  // gameplay overlays
  heat: number; // 0..MAX_HEAT — drives the pursuit arc
  waypoint: Vec2 | null;
  route: RouteResult | null;
  /** Set by `setWaypoint`; the update system consumes it to recompute the route. */
  routeDirty: boolean;

  // blips
  blips: Map<string, Blip>; // stable reference
  blipVersion: number; // bumps on add/remove only
  layers: MapLayerVisibility;

  // ── actions (the public blip API) ──
  upsertBlip: (b: Blip) => void;
  removeBlip: (id: string) => void;
  clearBlips: (filter?: (b: Blip) => boolean) => void;
  getBlip: (id: string) => Blip | undefined;

  setWaypoint: (at: Vec2 | null) => void;
  clearWaypoint: () => void;
  setRoute: (r: RouteResult | null) => void;
  consumeRouteDirty: () => boolean;

  toggleFullscreen: (open?: boolean) => void;
  setNorthUp: (v: boolean) => void;
  setAutoZoom: (v: boolean) => void;
  setZoomMeters: (m: number) => void;
  setOpacity: (v: number) => void;
  setScale: (v: number) => void;
  setColorBlind: (v: boolean) => void;
  setHeat: (n: number) => void;
  toggleLayer: (layer: BlipLayer, v?: boolean) => void;

  requestFastTravel: (at: Vec2, name?: string) => void;
}

/** Layer a blip style belongs to (for the full-map toggles). */
export function layerOfStyle(style: Blip["style"]): BlipLayer | null {
  switch (style) {
    case "enemy":
      return "enemy";
    case "police":
      return "police";
    case "vehicle":
      return "vehicle";
    case "poi":
    case "pickup":
      return "poi";
    case "friend":
      return "friend";
    case "mission":
    case "objective":
      return "mission";
    default:
      return null;
  }
}

export const useMapStore = create<MapState>()((set, get) => ({
  fullscreenOpen: false,
  northUp: false,
  autoZoom: true,
  zoomMeters: ZOOM_METERS.drive,

  opacity: 1,
  scale: 1,
  colorBlind: false,

  heat: 0,
  waypoint: null,
  route: null,
  routeDirty: false,

  blips: new Map<string, Blip>(),
  blipVersion: 0,
  layers: { enemy: true, police: true, vehicle: true, poi: true, friend: true, mission: true },

  upsertBlip: (b) => {
    const map = get().blips;
    const cur = map.get(b.id);
    if (cur) {
      // In-place mutation → no re-render; the RAF loop reads live positions.
      cur.style = b.style;
      cur.at = b.at;
      cur.entity = b.entity;
      cur.color = b.color;
      cur.label = b.label;
      cur.minimap = b.minimap;
      cur.fullmap = b.fullmap;
      cur.clampToEdge = b.clampToEdge;
      cur.height = b.height;
      cur.priority = b.priority;
      cur.sonar = b.sonar;
    } else {
      map.set(b.id, b);
      set({ blipVersion: get().blipVersion + 1 });
    }
  },

  removeBlip: (id) => {
    const map = get().blips;
    if (map.delete(id)) set({ blipVersion: get().blipVersion + 1 });
  },

  clearBlips: (filter) => {
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

  getBlip: (id) => get().blips.get(id),

  setWaypoint: (at) => {
    set({ waypoint: at, routeDirty: true });
    if (!at) set({ route: null });
    mapEvents.emit("waypointSet", { at });
  },

  clearWaypoint: () => get().setWaypoint(null),

  setRoute: (r) => {
    set({ route: r, routeDirty: false });
    mapEvents.emit("routeUpdated", { route: r });
  },

  consumeRouteDirty: () => {
    if (!get().routeDirty) return false;
    set({ routeDirty: false });
    return true;
  },

  toggleFullscreen: (open) => set({ fullscreenOpen: open ?? !get().fullscreenOpen }),
  setNorthUp: (v) => set({ northUp: v }),
  setAutoZoom: (v) => set({ autoZoom: v }),
  setZoomMeters: (m) => set({ zoomMeters: clamp(m, ZOOM_MIN_M, ZOOM_MAX_M) }),
  setOpacity: (v) => set({ opacity: clamp(v, 0.2, 1) }),
  setScale: (v) => set({ scale: clamp(v, 0.7, 1.6) }),
  setColorBlind: (v) => set({ colorBlind: v }),
  setHeat: (n) => set({ heat: clamp(Math.round(n), 0, 5) }),
  toggleLayer: (layer, v) =>
    set((s) => ({ layers: { ...s.layers, [layer]: v ?? !s.layers[layer] } })),

  requestFastTravel: (at, name) => mapEvents.emit("fastTravelRequest", { at, ...(name ? { name } : {}) }),
}));

/** Non-hook read for RAF loops / systems (avoids subscribing). */
export const getMapState = useMapStore.getState;
