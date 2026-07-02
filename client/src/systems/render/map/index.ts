// Subsystem: render/map (client). Rotating minimap + full-screen pause map + blip/route store.
// Self-registers on import (the systems-loader eager-imports this file); everything the integrator
// mounts or that other systems call is re-exported below.
//
// Implemented per gta6-build/01-render/map-minimap.md, constrained to this folder by WAVE2-PROTOCOL.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./map.components"; // ECS `map_blip` / `map_hidden` augmentation
import { initMap, mapUpdateSystem } from "./system";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "render/map",
  systems: [mapUpdateSystem],
  init: initMap,
};

registerModule(mod); // required self-registration side effect

/** Back-compat alias for the prior stub's named export. */
export const map = mod;

// ── React components (integrator mounts these in the DOM, siblings of <Canvas>) ──
export { Minimap } from "./Minimap";
export { PauseMap } from "./PauseMap";

// ── Blip / waypoint / route store — the app-wide map API for other subsystems ──
export { useMapStore, getMapState, layerOfStyle } from "./mapStore";
export type { MapState, MapLayerVisibility } from "./mapStore";

// ── Event bus (fast-travel hand-off, waypoint/route notices) ──
export { mapEvents } from "./events";
export type { MapEvents } from "./events";

// ── Data + routing (exposed for tooling / other systems) ──
export { SANTA_VISTA_MAP } from "./mapData";
export { recomputeRoute } from "./routing/router";
export { buildRoadGraph, findRoute } from "./roadGraph";

// ── Types ──
export type {
  Area,
  Blip,
  BlipLayer,
  BlipStyle,
  MapBlipComponent,
  MapBounds,
  MapData,
  PlayerCam,
  Poi,
  PoiType,
  Road,
  RoadClass,
  RouteRequest,
  RouteResult,
  Vec2,
} from "./mapTypes";
