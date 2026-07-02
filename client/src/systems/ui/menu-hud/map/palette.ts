// Map palette + per-kind blip styling. Warm "Verano" dusk basemap kept low-chroma so the HUD stays
// legible over any scene; blip colours track the menu-hud theme accents. Colour-blind variants pair
// with the distinct icon SHAPES in ./draw so the map reads without relying on hue.
import type { BlipKind, BlipLayer } from "./types";

/** City road classes as projected by render/city `toMapData`. */
export type MapRoadClass = "highway" | "arterial" | "street" | "alley";

export interface MapPalette {
  land: string;
  landEdge: string;
  water: string;
  block: string;
  blockEdge: string;
  districtFill: string;
  districtStroke: string;
  roadCasing: string;
  highway: string;
  arterial: string;
  street: string;
  alley: string;
  label: string;
  labelHalo: string;
}

/** Basemap palette — dusk indigo land, warm arterial glow. */
export const PALETTE: MapPalette = {
  land: "#0b0e18",
  landEdge: "#10131f",
  water: "#0f2c44",
  block: "#141827",
  blockEdge: "rgba(255,255,255,0.03)",
  districtFill: "rgba(255,255,255,0.015)",
  districtStroke: "rgba(255,255,255,0.05)",
  roadCasing: "#05060b",
  highway: "#ffb85c",
  arterial: "#d7dcea",
  street: "#8b93a8",
  alley: "#565d70",
  label: "rgba(240,243,250,0.72)",
  labelHalo: "rgba(0,0,0,0.62)",
};

/** Drawn road widths (world metres). Scaled to px at bake / draw time. */
export const ROAD_WIDTH_M: Record<MapRoadClass, number> = {
  highway: 22,
  arterial: 14,
  street: 8,
  alley: 4.5,
};

/** Nav-graph edge speeds (m/s). Edge weight = length / speed, so highways route faster. */
export const ROAD_SPEED: Record<MapRoadClass, number> = {
  highway: 33,
  arterial: 20,
  street: 12,
  alley: 7,
};
export const MAX_ROAD_SPEED = ROAD_SPEED.highway;

export const roadColor = (cls: MapRoadClass): string => PALETTE[cls];

/** Minimap visible-radius presets (world metres). */
export const ZOOM_METERS = { walk: 68, drive: 150, fly: 320 } as const;
export const ZOOM_MIN_M = 40;
export const ZOOM_MAX_M = 400;

/** Route line colours (+ colour-blind swap). */
export const ROUTE_COLOR = "#ff9a55";
export const ROUTE_GLOW = "rgba(255,138,76,0.42)";
export const ROUTE_COLOR_CB = "#56B4E9";
export const ROUTE_GLOW_CB = "rgba(86,180,233,0.42)";

/** Pursuit heat arc. */
export const HEAT_COLOR = "#ff5a5f";
export const MAX_HEAT = 5;

/** Recompute the route once the player strays this far (m) from the drawn line. */
export const ROUTE_DEVIATION_M = 26;

// ── Blip colours ───────────────────────────────────────────────────────────────

export const BLIP_COLORS: Record<BlipKind, string> = {
  player: "#ff7a59",
  waypoint: "#ffd166",
  mission: "#ffb85c",
  missionGiver: "#ffcf6b",
  objective: "#ffe08a",
  shop: "#6fe0a6",
  dealership: "#4aa8ff",
  property: "#ffb85c",
  activity: "#b98bff",
  vehicle: "#cfd5e3",
  police: "#4c8cff",
  enemy: "#ff5a5f",
  friend: "#4ad991",
  gas: "#ffce6b",
  hospital: "#ff6b9d",
  garage: "#cfd5e3",
  safehouse: "#4ad991",
  collectible: "#ffe08a",
  pickup: "#b98bff",
  poi: "#8fd0ff",
  custom: "#ffffff",
};

/** Colour-blind-safe palette (Okabe–Ito derived) — paired with distinct blip shapes. */
export const BLIP_COLORS_CB: Record<BlipKind, string> = {
  player: "#E69F00",
  waypoint: "#F0E442",
  mission: "#E69F00",
  missionGiver: "#E69F00",
  objective: "#F5EC9A",
  shop: "#009E73",
  dealership: "#56B4E9",
  property: "#E69F00",
  activity: "#CC79A7",
  vehicle: "#CCCCCC",
  police: "#0072B2",
  enemy: "#D55E00",
  friend: "#009E73",
  gas: "#F0E442",
  hospital: "#D55E00",
  garage: "#CCCCCC",
  safehouse: "#009E73",
  collectible: "#F5EC9A",
  pickup: "#CC79A7",
  poi: "#56B4E9",
  custom: "#FFFFFF",
};

export function blipColor(kind: BlipKind, colorBlind: boolean, override?: string): string {
  if (override) return override;
  return (colorBlind ? BLIP_COLORS_CB : BLIP_COLORS)[kind];
}

// ── Blip icon shapes ───────────────────────────────────────────────────────────

export type BlipShape =
  | "arrow"
  | "pin"
  | "circle"
  | "ring"
  | "diamond"
  | "square"
  | "triangle"
  | "chip"
  | "star"
  | "cross"
  | "house"
  | "dot";

export interface BlipStyle {
  shape: BlipShape;
  /** Glyph drawn inside the icon on the FULL map (never on the tiny minimap). */
  glyph?: string;
}

export const BLIP_STYLE: Record<BlipKind, BlipStyle> = {
  player: { shape: "arrow" },
  waypoint: { shape: "pin" },
  mission: { shape: "circle" },
  missionGiver: { shape: "ring", glyph: "!" },
  objective: { shape: "diamond" },
  shop: { shape: "chip", glyph: "$" },
  dealership: { shape: "chip", glyph: "C" },
  property: { shape: "house", glyph: "" },
  activity: { shape: "star" },
  vehicle: { shape: "chip" },
  police: { shape: "square" },
  enemy: { shape: "triangle" },
  friend: { shape: "ring" },
  gas: { shape: "dot", glyph: "F" },
  hospital: { shape: "cross" },
  garage: { shape: "square", glyph: "G" },
  safehouse: { shape: "house", glyph: "H" },
  collectible: { shape: "diamond", glyph: "*" },
  pickup: { shape: "dot" },
  poi: { shape: "dot" },
  custom: { shape: "dot" },
};

// ── Layers (full-map toggles + legend) ──────────────────────────────────────────

const LAYER_OF: Partial<Record<BlipKind, BlipLayer>> = {
  mission: "mission",
  missionGiver: "mission",
  objective: "mission",
  shop: "shop",
  dealership: "shop",
  property: "shop",
  gas: "shop",
  hospital: "shop",
  garage: "shop",
  safehouse: "shop",
  activity: "activity",
  collectible: "activity",
  pickup: "activity",
  poi: "activity",
  vehicle: "vehicle",
  police: "police",
  enemy: "police",
  friend: "police",
};

/** Which toggle-layer a kind belongs to (waypoint/player are always shown → null). */
export const layerOf = (kind: BlipKind): BlipLayer | null => LAYER_OF[kind] ?? null;

export const LAYER_LABELS: Record<BlipLayer, string> = {
  mission: "Missions",
  shop: "Services",
  activity: "Activities",
  vehicle: "Vehicles",
  police: "Police",
};
