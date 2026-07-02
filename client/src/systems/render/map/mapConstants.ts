// Scale, zoom presets and the (original) blip / basemap palette.
import type { BlipStyle, RoadClass } from "./mapTypes";

export const MAP_VERSION = 1;

/** Basemap raster resolution: pixels per world metre. Kept at 1 so the authored 1400 m city
 *  bakes to a 1400 px basemap (< the cap below). */
export const PX_PER_M = 1;
/** Hard cap on either basemap dimension (HiDPI fill-rate + memory guard). */
export const MAX_BASEMAP_PX = 2048;

/** Minimap diameter in CSS px (multiplied by the accessibility `scale`). */
export const MINIMAP_SIZE = 208;
/** Cap the minimap backing store DPR (fill-rate). */
export const MINIMAP_MAX_DPR = 2;
/** Minimap redraw cadence — the map needs far less than the 3D scene. */
export const MINIMAP_HZ = 45;

/** Drawn road widths (world metres) — scaled into basemap px at bake time. */
export const ROAD_WIDTH_M: Record<RoadClass, number> = {
  highway: 22,
  arterial: 14,
  street: 8,
  alley: 4,
};

/** Nav-graph edge speeds (m/s). Edge weight = length / speed, so highways route faster. */
export const ROAD_SPEED: Record<RoadClass, number> = {
  highway: 33,
  arterial: 20,
  street: 12,
  alley: 7,
};

export const MAX_ROAD_SPEED = ROAD_SPEED.highway;

/** Auto-zoom presets — the minimap's visible radius in world metres. */
export const ZOOM_METERS: Record<"walk" | "drive" | "fly", number> = {
  walk: 70,
  drive: 155,
  fly: 320,
};
export const ZOOM_MIN_M = 40;
export const ZOOM_MAX_M = 380;

/** Basemap palette — warm "Verano" dusk, kept low-chroma so the HUD stays legible over any scene. */
export interface MapPalette {
  land: string;
  landEdge: string;
  water: string;
  waterEdge: string;
  beach: string;
  park: string;
  districtFill: string;
  districtStroke: string;
  block: string;
  roadCasing: string;
  highway: string;
  arterial: string;
  street: string;
  alley: string;
  label: string;
  labelHalo: string;
}

export const PALETTE: MapPalette = {
  land: "#0d0f16",
  landEdge: "#141824",
  water: "#123047",
  waterEdge: "#0d2436",
  beach: "#2b2a1d",
  park: "#16261c",
  districtFill: "rgba(255,255,255,0.022)",
  districtStroke: "rgba(255,255,255,0.05)",
  block: "#161a26",
  roadCasing: "#05060a",
  highway: "#f7b267",
  arterial: "#cfd5e3",
  street: "#8b93a8",
  alley: "#5b6274",
  label: "rgba(240,243,250,0.74)",
  labelHalo: "rgba(0,0,0,0.6)",
};

export const roadColor = (cls: RoadClass, p: MapPalette = PALETTE): string =>
  cls === "highway" ? p.highway : cls === "arterial" ? p.arterial : cls === "street" ? p.street : p.alley;

/** Default blip palette. */
export const BLIP_COLORS: Record<BlipStyle, string> = {
  player: "#ff8a4c",
  waypoint: "#ffd166",
  mission: "#ffd166",
  objective: "#ffe08a",
  enemy: "#ff5470",
  police: "#4c8cff",
  friend: "#46d39a",
  vehicle: "#cfd5e3",
  poi: "#8fd0ff",
  pickup: "#c792ff",
  custom: "#ffffff",
};

/** Colour-blind-safe palette (Okabe–Ito derived) — paired with distinct blip shapes. */
export const BLIP_COLORS_CB: Record<BlipStyle, string> = {
  player: "#E69F00",
  waypoint: "#F0E442",
  mission: "#F0E442",
  objective: "#F5EC9A",
  enemy: "#D55E00",
  police: "#0072B2",
  friend: "#009E73",
  vehicle: "#CCCCCC",
  poi: "#56B4E9",
  pickup: "#CC79A7",
  custom: "#FFFFFF",
};

export const ROUTE_COLOR = "#ff9a55";
export const ROUTE_GLOW = "rgba(255,138,76,0.45)";
export const ROUTE_COLOR_CB = "#56B4E9";

export const HEAT_COLOR = "#ff5470";
export const MAX_HEAT = 5;

/** Recompute the GPS route once the player strays this far (m) from the drawn line. */
export const ROUTE_DEVIATION_M = 22;
/** Minimum seconds between deviation-triggered recomputes. */
export const ROUTE_RECHECK_S = 0.5;
