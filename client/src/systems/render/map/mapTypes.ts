// Map & Minimap — local type contracts.
//
// WAVE-2 note: this subsystem owns ONLY `client/src/systems/render/map/`, so the map data
// contracts that the canon spec places in `shared/src/map/` live here instead (we may not touch
// `shared/**`). Everything is a plain serializable POJO so it could be lifted into `shared` later
// by the integrator with a copy-paste.

/** World ground-plane coordinate (Three.js X / Z, metres). Y is up and irrelevant to the 2D map. */
export type Vec2 = { x: number; z: number };

export type RoadClass = "highway" | "arterial" | "street" | "alley";

/** A polyline road. Vertices at every intersection so the nav-graph connects into a lattice. */
export interface Road {
  id: number;
  cls: RoadClass;
  name?: string;
  pts: Vec2[];
}

export type AreaKind = "water" | "beach" | "district" | "park" | "block";

export interface Area {
  id: number;
  kind: AreaKind;
  name?: string;
  poly: Vec2[];
  /** Optional explicit label anchor; defaults to the polygon centroid. */
  label?: Vec2;
}

export type PoiType =
  | "safehouse"
  | "shop"
  | "gas"
  | "hospital"
  | "garage"
  | "activity"
  | "property"
  | "fasttravel"
  | "collectible";

export interface Poi {
  id: number;
  type: PoiType;
  name: string;
  at: Vec2;
}

export interface MapBounds {
  min: Vec2;
  max: Vec2;
}

/** The authored/baked vector city. */
export interface MapData {
  version: number;
  name: string;
  bounds: MapBounds;
  roads: Road[];
  areas: Area[];
  pois: Poi[];
}

// ── Blips ────────────────────────────────────────────────────────────────────

export type BlipStyle =
  | "player"
  | "waypoint"
  | "mission"
  | "objective"
  | "enemy"
  | "police"
  | "friend"
  | "vehicle"
  | "poi"
  | "pickup"
  | "custom";

/** A live marker on the map/minimap. Owned by `useMapStore`; other systems upsert these. */
export interface Blip {
  /** Stable unique key. Entity-bound blips use `ent:<netId>` (see the store helpers). */
  id: string;
  style: BlipStyle;
  at: Vec2;
  /** Owning entity netId, when the blip tracks an ECS entity. */
  entity?: number;
  /** Override the palette colour for `style` (any CSS colour). */
  color?: string;
  label?: string;
  /** Show on the rotating minimap (default true). */
  minimap?: boolean;
  /** Show on the full-screen map (default true). */
  fullmap?: boolean;
  /** Clamp to the minimap ring with a chevron when out of range (default true). */
  clampToEdge?: boolean;
  /** World Y — drives the above/below height indicator on the minimap. */
  height?: number;
  /** Higher wins when culling / draws on top. */
  priority?: number;
  /** Pulsing "sonar" ring (objectives, pings). */
  sonar?: boolean;
}

/** ECS component payload (see `map.components.ts`) letting any entity opt into being a blip. */
export interface MapBlipComponent {
  style: BlipStyle;
  color?: string;
  label?: string;
  minimap?: boolean;
  clampToEdge?: boolean;
  priority?: number;
}

/** Layers the player can toggle on the full map. */
export type BlipLayer = "enemy" | "police" | "vehicle" | "poi" | "friend" | "mission";

// ── Routing ──────────────────────────────────────────────────────────────────

export interface RouteRequest {
  from: Vec2;
  to: Vec2;
  avoidHighways?: boolean;
}

export interface RouteResult {
  ok: boolean;
  /** World-space polyline from origin to destination (empty when `ok` is false). */
  path: Vec2[];
  /** Total length in metres (Infinity when unreachable). */
  distance: number;
}

// ── Player read model ─────────────────────────────────────────────────────────

/** Snapshot of the local player, read from the ECS each frame. */
export interface PlayerCam {
  x: number;
  y: number;
  z: number;
  /** Visual yaw in radians (ECS `movement.facing`). */
  heading: number;
  /** Planar speed, m/s. */
  speed: number;
  mode: string;
  valid: boolean;
}
