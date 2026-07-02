// The data-driven map format for Santa Vista. Pure types — the whole generation pipeline
// produces a `CityMapDoc` (a serializable POJO, i.e. "map.json"), and every other subsystem
// (traffic, peds, minimap, physics, MP) consumes THIS, never the generator internals.
//
// Ground plane convention: THREE X/Z, Y up. All 2D coords are { x, z } in meters.

/** 2D ground-plane point (meters). Matches the minimap's `Vec2`. */
export interface Vec2 {
  x: number;
  z: number;
}

/** JSON-friendly 3D position/extent. */
export type Vec3Arr = [number, number, number];

// ── Road graph (the traffic/ped/nav contract) ────────────────────────────────

export type RoadClass = "arterial" | "collector" | "local";

export interface RoadNode {
  id: number;
  x: number;
  z: number;
}

export interface RoadEdge {
  /** node id */
  a: number;
  /** node id */
  b: number;
  klass: RoadClass;
  /** full carriageway width in meters */
  width: number;
  /** total lane count (both directions) — traffic derives directed lanes from this */
  lanes: number;
  /** edge length in meters (precomputed for routing weights) */
  length: number;
}

/** The shared, consumable road network. `traffic-ai` calls this `MapDoc.roads`. */
export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

// ── Districts (authored input → carried into the doc) ─────────────────────────

export type DistrictKey =
  | "miracle_row"
  | "costa_dorada"
  | "calle_sol"
  | "the_mint";

export interface DistrictStyle {
  /** [min, max] floor count for procedural buildings. */
  floorRange: [number, number];
  /** CC0 kit identifier the renderer/asset-catalog maps to real modules. */
  kitSet: string;
  /** facade base colors (hex). */
  palette: string[];
  /** neon/emissive facades (Costa Dorada / Neon Mile). */
  emissive: boolean;
  /** glass curtain-wall towers (Miracle Row). */
  glass: boolean;
  /** 0..1 lot fill probability. */
  density: number;
  zone: Zone;
}

export interface DistrictSpec {
  key: DistrictKey;
  name: string;
  poly: Vec2[];
  style: DistrictStyle;
}

// ── Blocks / lots ─────────────────────────────────────────────────────────────

export type Zone = "commercial" | "residential" | "industrial" | "mixed";

export interface BlockSpec {
  id: number;
  tile: number;
  district: DistrictKey;
  /** buildable interior polygon (road width already subtracted). */
  poly: Vec2[];
  centroid: Vec2;
  area: number;
}

export interface LotSpec {
  id: string;
  block: number;
  tile: number;
  district: DistrictKey;
  poly: Vec2[];
  centroid: Vec2;
  area: number;
  /** heading (radians) the building frontage faces (toward the nearest road). */
  frontage: number;
  zone: Zone;
  style: string;
}

// ── Buildings ─────────────────────────────────────────────────────────────────

export interface BuildingSpec {
  id: string;
  lotId: string;
  tile: number;
  district: DistrictKey;
  center: Vec2;
  width: number;
  depth: number;
  rotationY: number;
  floors: number;
  height: number;
  kitSet: string;
  style: string;
  /** base facade color (hex). */
  color: string;
  emissive: boolean;
  glass: boolean;
  /** taller towers get a stepped-back crown volume. */
  setbackTop: boolean;
}

// ── Props (pure GPU instancing buffers) ───────────────────────────────────────

export type PropType = "streetlight" | "tree" | "hydrant" | "bench" | "trafficlight";

export interface PropGroup {
  type: PropType;
  count: number;
  /** row-major 4×4 matrices, length = count*16 (→ Float32Array at load time). */
  matrices: number[];
  /** per-instance tile id, length = count (for streaming page-in/out). */
  tiles: number[];
}

// ── Pedestrian surfaces (sidewalks + crosswalks) ──────────────────────────────

export interface SidewalkSegment {
  a: Vec2;
  b: Vec2;
  width: number;
}

export interface Crosswalk {
  id: number;
  /** road-graph node this crossing sits at. */
  node: number;
  at: Vec2;
  /** heading (radians) the stripes run across. */
  dir: number;
  length: number;
  width: number;
}

// ── Landmarks (hand-authored hero placements) ─────────────────────────────────

export type LandmarkKind = "tower" | "strip" | "stadium" | "mall";

export interface Landmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  footprint: Vec2[];
  position: Vec3Arr;
  rotationY: number;
  height: number;
  kitSet: string;
}

// ── Physics + spawns ──────────────────────────────────────────────────────────

export interface Collider {
  kind: "cuboid";
  tile: number;
  halfExtents: Vec3Arr;
  position: Vec3Arr;
  rotationY: number;
  tag: "building" | "ground" | "landmark";
}

export type SpawnKind = "player" | "vehicle" | "ped";

export interface SpawnPoint {
  id: string;
  kind: SpawnKind;
  position: Vec3Arr;
  yaw: number;
}

// ── Streaming tile index ──────────────────────────────────────────────────────

export interface TileBucket {
  buildings: number[];
  props: number[];
  nodes: number[];
}

export interface TileIndex {
  size: number;
  cols: number;
  rows: number;
  /** world coordinate of tile (0,0)'s min corner. */
  originX: number;
  originZ: number;
  tiles: Record<number, TileBucket>;
}

// ── The emitted artifact ──────────────────────────────────────────────────────

export interface CityBounds {
  min: Vec2;
  max: Vec2;
}

/** The full generated city artifact ("santa-vista.map.json"). Serializable POJO. */
export interface CityMapDoc {
  version: 1;
  seed: number;
  bounds: CityBounds;
  tileSize: number;
  roads: RoadGraph;
  districts: DistrictSpec[];
  blocks: BlockSpec[];
  lots: LotSpec[];
  buildings: BuildingSpec[];
  props: PropGroup[];
  sidewalks: SidewalkSegment[];
  crosswalks: Crosswalk[];
  landmarks: Landmark[];
  colliders: Collider[];
  spawns: SpawnPoint[];
  tiles: TileIndex;
}

// ── Consumer view: 2D MapData for the minimap (mirrors map-minimap `MapData`) ──

export type MapRoadClass = "highway" | "arterial" | "street" | "alley";

export interface MapRoad {
  id: number;
  cls: MapRoadClass;
  pts: Vec2[];
}

export interface MapArea {
  id: number;
  kind: "water" | "district" | "park" | "block";
  name?: string;
  poly: Vec2[];
  label?: Vec2;
}

export type MapPoiType = "safehouse" | "shop" | "landmark" | "spawn" | "fasttravel";

export interface MapPoi {
  id: number;
  type: MapPoiType;
  name: string;
  at: Vec2;
}

export interface MapData {
  version: number;
  bounds: { min: Vec2; max: Vec2 };
  roads: MapRoad[];
  areas: MapArea[];
  pois: MapPoi[];
}

// ── Consumer view: walkable graph for pedestrians ─────────────────────────────

export interface WalkNode {
  id: number;
  x: number;
  z: number;
  kind: "corner" | "crosswalk";
}

export interface WalkEdge {
  a: number;
  b: number;
  length: number;
  kind: "sidewalk" | "crossing";
}

export interface WalkGraph {
  nodes: WalkNode[];
  edges: WalkEdge[];
}
