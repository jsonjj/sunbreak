// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL WORLD MAP for Santa Vista — a single, pure (no THREE, no side-effects)
// source of truth shared by render/city, render/environment, render/streaming and
// physics/world-colliders. Everything that needs to know "where is land, where is
// water, which district is here, and where is the edge of the world" reads THIS, so
// terrain, water, roads, buildings, foliage and colliders can never disagree.
//
// Convention: +X east, −X west, +Z south, −Z north, Y up. (Minimap: +Z is "down".)
//
// The world is an ISLAND. Land is a wobbly rounded-rectangle plateau that comfortably
// contains the ±CITY_HALF street grid; open sea lies beyond the coastline, and two
// carved water bodies (a south-west Marina harbour + a north-east Glades marsh) sit
// inside the coast. Nothing that reads isWater()/districtAt() will place a road, a
// building, a ground slab or a tree in the water — which is the real fix for the
// "streets randomly flood" bug (see render/environment/water for the rendering half).
// ─────────────────────────────────────────────────────────────────────────────
import { CITY_HALF } from "./config";
import type { DistrictKey, Landmark, LandmarkKind, Vec2, Zone } from "./types";

// ── Vertical datum (metres) ──────────────────────────────────────────────────
/** Sea surface. Kept BELOW the flat city ground (city slab sits at y=-0.01) so land
 *  never dips under the waterline → the ocean plane can only ever draw over real sea. */
export const WATER_LEVEL = -1.2;
/** Dry-land plateau height — a hair under the city ground slab so the slab always wins
 *  the depth test over the terrain mesh (no z-fighting) yet stays well above the water. */
export const LAND_HEIGHT = -0.25;
/** Height the beach reaches the waterline at the coast (just under the sea surface). */
export const SHORE_HEIGHT = WATER_LEVEL - 0.2;

// ── Horizontal extents (metres, centred on origin) ───────────────────────────
/** Street-grid / district extent (matches config.CITY_HALF). */
export const CITY_EXTENT = CITY_HALF;
/** Hard world boundary: invisible walls sit here (just past every district/landmark + the ~542 m
 *  coastline). The Scene safety floor is sized to PLAYABLE_HALF + a small margin, so the walls sit
 *  just INSIDE the solid ground — the player is always stopped while still on the floor, with no gap
 *  and no way to fall into the void anywhere inside the walls. */
export const PLAYABLE_HALF = 560;
/** Environment terrain is built out to here (> PLAYABLE_HALF so ground/collision reaches
 *  the boundary wall, with open ocean rendered beyond it toward the horizon). */
export const BUILT_HALF = 640;
/** Aircraft soft ceiling (turn-back / thrust-cut altitude) + a hard ceiling collider above it. */
export const FLIGHT_CEILING = 340;
export const FLIGHT_HARD_CEILING = 380;

// ── Coastline (island = wobbly rounded rectangle) ────────────────────────────
const COAST_BASE = 542; // nominal land half-extent to the waterline
const COAST_WOBBLE = 20; // metres of organic coast wobble
/** Beach band width: terrain ramps from the waterline up to the plateau over this many m. */
export const BEACH_WIDTH = 48;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function coastWobble(t: number, seed: number): number {
  return (
    (Math.sin(t * 0.011 + seed) * 0.6 +
      Math.sin(t * 0.021 + seed * 2.3) * 0.3 +
      Math.sin(t * 0.043 + seed * 5.1) * 0.1) *
    COAST_WOBBLE
  );
}

/** Signed distance INTO the island from the nearest coast: >0 inland, ≈0 at the waterline,
 *  <0 out at sea. A rounded-rect field (min over the 4 wobbly edges). */
export function coastInset(x: number, z: number): number {
  const halfX = COAST_BASE + coastWobble(z, 1.7);
  const halfZ = COAST_BASE + coastWobble(x, 4.2);
  return Math.min(halfX - Math.abs(x), halfZ - Math.abs(z));
}

// ── Carved water bodies (inside the coastline) ───────────────────────────────
/** South-west Marina harbour — the calm hero-reflector body + boat/dock water. */
export const MARINA = { x: -250, z: 495, radius: 118, floor: -3.4 } as const;
/** North-east Glades marsh — murky shallow standing water (mangroves/cypress/pilings). Kept a
 *  little inland of the coast so its water plane stays inside the built terrain. */
export const GLADES = { x: 470, z: -400, radius: 122 } as const;
/** Standing-water surface of the Glades (shallow → just under the plateau). */
export const GLADES_LEVEL = LAND_HEIGHT - 0.28;
/** Muddy floor of the Glades marsh. */
export const GLADES_FLOOR = GLADES_LEVEL - 0.45;

/** 0 outside → 1 inside the Marina basin. */
export function marinaMask(x: number, z: number): number {
  const d = Math.hypot(x - MARINA.x, z - MARINA.z);
  return 1 - smoothstep(MARINA.radius * 0.7, MARINA.radius, d);
}

/** 0 outside → 1 deep in the Glades marsh (wobbly edge). */
export function gladesMask(x: number, z: number): number {
  const d = Math.hypot(x - GLADES.x, z - GLADES.z);
  const edge = GLADES.radius * (0.85 + 0.18 * Math.sin(x * 0.01 + z * 0.013 + 3.1));
  return 1 - smoothstep(edge * 0.5, edge, d);
}

/**
 * Master land/water predicate. TRUE where a genuine water body exists (open sea beyond
 * the coast, the Marina harbour, or the Glades marsh). Used to keep roads/buildings/
 * ground/foliage/streamed content OUT of the water everywhere in the pipeline.
 */
export function isWater(x: number, z: number): boolean {
  if (coastInset(x, z) < BEACH_WIDTH * 0.15) return true; // beyond the coast / on the wet shore
  if (marinaMask(x, z) > 0.5) return true;
  if (gladesMask(x, z) > 0.5) return true;
  return false;
}

/** Slightly padded water test for pruning (keeps roads/slab a touch back from the edge). */
export function isWaterPadded(x: number, z: number, pad: number): boolean {
  if (coastInset(x, z) < BEACH_WIDTH * 0.15 + pad) return true;
  const dm = Math.hypot(x - MARINA.x, z - MARINA.z);
  if (dm < MARINA.radius + pad) return true;
  const dg = Math.hypot(x - GLADES.x, z - GLADES.z);
  if (dg < GLADES.radius + pad) return true;
  return false;
}

// ── Districts (rectangular regions → the authored district polygons + styling) ─
export type GroundKind = "urban" | "park" | "apron" | "none";

export interface DistrictRegion {
  key: DistrictKey;
  name: string;
  /** Axis-aligned world rect [x0,z0]→[x1,z1]. */
  rect: { x0: number; z0: number; x1: number; z1: number };
  zone: Zone;
  /** false = open/no-build (parks, airfield apron): roads only, no lots filled. */
  buildable: boolean;
  ground: GroundKind;
  floorRange: [number, number];
  kitSet: string;
  palette: string[];
  emissive: boolean;
  glass: boolean;
  density: number;
}

/**
 * The seven districts of Santa Vista. Ordered so districtAt() resolves overlaps by the
 * FIRST match; gaps between rects read as open plazas/lots (roads remain, no buildings).
 */
export const DISTRICTS: DistrictRegion[] = [
  {
    key: "miracle_row",
    name: "Miracle Row",
    rect: { x0: -170, z0: -170, x1: 170, z1: 150 },
    zone: "commercial",
    buildable: true,
    ground: "urban",
    floorRange: [16, 44],
    kitSet: "quaternius/downtown-megakit",
    palette: ["#8fa6c4", "#7f93b3", "#9fb2cc", "#6f86a8", "#aab8cf"],
    emissive: false,
    glass: true,
    density: 0.92,
  },
  {
    key: "costa_dorada",
    name: "Costa Dorada",
    rect: { x0: 170, z0: -180, x1: 470, z1: 205 },
    zone: "mixed",
    buildable: true,
    ground: "urban",
    floorRange: [5, 15],
    kitSet: "quaternius/cyberpunk-kit",
    palette: ["#e8b06a", "#d98f5a", "#e6c288", "#c96f8a", "#f0d29a"],
    emissive: true,
    glass: false,
    density: 0.86,
  },
  {
    key: "calle_sol",
    name: "Calle Sol",
    rect: { x0: -470, z0: -470, x1: -170, z1: -60 },
    zone: "residential",
    buildable: true,
    ground: "urban",
    floorRange: [1, 3],
    kitSet: "kenney/city-suburban",
    palette: ["#e9dcc3", "#e4c9a1", "#d9b48c", "#f0e2cf", "#e7cbb0"],
    emissive: false,
    glass: false,
    density: 0.72,
  },
  {
    key: "north_park",
    name: "Vista Park",
    rect: { x0: -170, z0: -470, x1: 170, z1: -170 },
    zone: "mixed",
    buildable: false,
    ground: "park",
    floorRange: [1, 2],
    kitSet: "kenney/nature",
    palette: ["#8aa06a", "#7c9a52"],
    emissive: false,
    glass: false,
    density: 0,
  },
  {
    key: "the_mint",
    name: "The Mint",
    rect: { x0: -470, z0: 100, x1: -120, z1: 470 },
    zone: "industrial",
    buildable: true,
    ground: "urban",
    floorRange: [1, 4],
    kitSet: "kenney/city-commercial",
    palette: ["#9a8f83", "#a86e57", "#8d8378", "#b5a48f", "#7f776b"],
    emissive: false,
    glass: false,
    density: 0.6,
  },
  {
    key: "bayfront",
    name: "Bayfront Boardwalk",
    rect: { x0: -120, z0: 300, x1: 300, z1: 470 },
    zone: "mixed",
    buildable: true,
    ground: "urban",
    floorRange: [2, 7],
    kitSet: "kenney/city-commercial",
    palette: ["#e6d2b0", "#d98f8f", "#8fbcc4", "#e8c07a", "#c98fb0"],
    emissive: true,
    glass: false,
    density: 0.62,
  },
  {
    key: "airfield",
    name: "Sol Verano Airfield",
    rect: { x0: 300, z0: 210, x1: 470, z1: 470 },
    zone: "industrial",
    buildable: false,
    ground: "apron",
    floorRange: [1, 2],
    kitSet: "kenney/city-commercial",
    palette: ["#b9bcc2", "#9aa0a8"],
    emissive: false,
    glass: false,
    density: 0,
  },
];

const inRect = (x: number, z: number, r: DistrictRegion["rect"]): boolean =>
  x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** District covering a world point (first match), or null (open space). */
export function districtAt(x: number, z: number): DistrictRegion | null {
  for (const d of DISTRICTS) if (inRect(x, z, d.rect)) return d;
  return null;
}

/** Ground kind authored for a district key (urban/park/apron), or "none" if unknown. */
export function districtGround(key: DistrictKey): GroundKind {
  for (const d of DISTRICTS) if (d.key === key) return d.ground;
  return "none";
}

/** Full district record for a key (style/zone/floors), or undefined. */
export function districtByKey(key: DistrictKey): DistrictRegion | undefined {
  return DISTRICTS.find((d) => d.key === key);
}

/** Acquisition points that get hero SIGNAGE in the 3D world (gun store, car dealership). Coords
 *  mirror the integrator's worldContent placements so the signs sit on the actual shop plots. */
export interface AcquisitionSign {
  id: string;
  kind: "gun" | "car";
  x: number;
  z: number;
  label: string;
}
export const ACQUISITION_SIGNS: AcquisitionSign[] = [
  { id: "gunstore", kind: "gun", x: 235, z: 40, label: "GUNS" },
  { id: "dealership", kind: "car", x: -45, z: 70, label: "AUTOS" },
];

/**
 * Ground surface the CITY should paint at a point: urban slab, park lawn, airfield apron,
 * or "none" (open lots / beach / water → let the environment terrain show through). Water
 * always wins so the city never lays a slab over the sea/harbour/marsh.
 */
export function groundKindAt(x: number, z: number): GroundKind {
  if (isWater(x, z)) return "none";
  const d = districtAt(x, z);
  return d ? d.ground : "none";
}

// ── Landmarks (hero placements; rough coords documented in the workstream report) ─
interface LandmarkAnchor {
  id: string;
  name: string;
  kind: LandmarkKind;
  /** center [x,z]; footprint is auto-built as a rect of these half-extents. */
  at: Vec2;
  half: { x: number; z: number };
  rotationY: number;
  height: number;
  kitSet: string;
}

const LANDMARK_ANCHORS: LandmarkAnchor[] = [
  {
    id: "solaris_tower",
    name: "Solaris Tower",
    kind: "tower",
    at: { x: 0, z: -20 },
    half: { x: 26, z: 26 },
    rotationY: 0,
    height: 196,
    kitSet: "quaternius/downtown-megakit",
  },
  {
    id: "neon_mile",
    name: "The Neon Mile",
    kind: "strip",
    at: { x: 315, z: 30 },
    half: { x: 150, z: 5 },
    rotationY: 0,
    height: 11,
    kitSet: "quaternius/cyberpunk-kit",
  },
  {
    id: "vista_mall",
    name: "Vista Galleria",
    kind: "mall",
    at: { x: 380, z: 150 },
    half: { x: 56, z: 40 },
    rotationY: 0,
    height: 26,
    kitSet: "kenney/city-commercial",
  },
  {
    id: "estadio_sol",
    name: "Estadio Sol",
    kind: "stadium",
    at: { x: 250, z: 265 },
    half: { x: 70, z: 55 },
    rotationY: 0,
    height: 40,
    kitSet: "kenney/city-commercial",
  },
  {
    id: "bayfront_pier",
    name: "Sunset Pier",
    kind: "pier",
    at: { x: 95, z: 520 },
    half: { x: 9, z: 70 },
    rotationY: 0,
    height: 6,
    kitSet: "kenney/city-commercial",
  },
  {
    id: "airfield_tower",
    name: "Airfield Control",
    kind: "tower",
    at: { x: 320, z: 250 },
    half: { x: 8, z: 8 },
    rotationY: 0,
    height: 34,
    kitSet: "kenney/city-commercial",
  },
  {
    id: "mint_hangar",
    name: "Customs Hangar",
    kind: "hangar",
    at: { x: 405, z: 380 },
    half: { x: 46, z: 32 },
    rotationY: 0,
    height: 20,
    kitSet: "kenney/city-commercial",
  },
];

/** Materialise the authored Landmark[] (footprint rect derived from anchor half-extents). */
export function buildLandmarks(): Landmark[] {
  return LANDMARK_ANCHORS.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    footprint: [
      { x: a.at.x - a.half.x, z: a.at.z - a.half.z },
      { x: a.at.x + a.half.x, z: a.at.z - a.half.z },
      { x: a.at.x + a.half.x, z: a.at.z + a.half.z },
      { x: a.at.x - a.half.x, z: a.at.z + a.half.z },
    ],
    position: [a.at.x, 0, a.at.z],
    rotationY: a.rotationY,
    height: a.height,
    kitSet: a.kitSet,
  }));
}

// ── World boundary (for the report + physics/world-colliders) ─────────────────
export const BOUNDARY = {
  minX: -PLAYABLE_HALF,
  maxX: PLAYABLE_HALF,
  minZ: -PLAYABLE_HALF,
  maxZ: PLAYABLE_HALF,
  wallHeight: FLIGHT_HARD_CEILING + 60,
  ceilingY: FLIGHT_HARD_CEILING,
  softCeilingY: FLIGHT_CEILING,
} as const;
