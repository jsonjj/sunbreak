// ui/menu-hud/map — local map/minimap type contracts.
//
// This subsystem owns the HUD, minimap and full-screen map, plus the app-wide BLIP + waypoint
// API other systems call to populate them. Road/area geometry is READ from the render/city road
// graph (via its public port); everything here is a plain serializable POJO so nothing couples to
// a sibling subsystem's internals.

/** World ground-plane point (Three.js X / Z, metres). Y is up and irrelevant to the 2D map. */
export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Anything a caller might already have for a position: an `{x,z}` (optionally `{x,y,z}`), a
 * `THREE.Vector3`-like object, or a tuple. `normalizeWorldPos` coerces all of these to `Vec2`
 * (+ optional height). Makes the public API friction-free for every subsystem.
 */
export type WorldPos =
  | { x: number; y?: number; z: number }
  | readonly [x: number, y: number, z: number]
  | readonly [x: number, z: number];

/**
 * Every marker kind the minimap + map can draw. A superset of the shared `BlipKind` so callers
 * can express real GTA-like points of interest (shops, dealerships, mission-givers, activities,
 * police, …). Each maps to a colour + an icon shape in `./palette` + `./draw`.
 */
export type BlipKind =
  | "player"
  | "waypoint"
  | "mission"
  | "missionGiver"
  | "objective"
  | "shop"
  | "dealership"
  | "property"
  | "activity"
  | "vehicle"
  | "police"
  | "enemy"
  | "friend"
  | "gas"
  | "hospital"
  | "garage"
  | "safehouse"
  | "collectible"
  | "pickup"
  | "poi"
  | "custom";

/** Grouping used for the full-map layer toggles + legend. */
export type BlipLayer = "mission" | "shop" | "activity" | "vehicle" | "police";

/**
 * The public argument to `addBlip`. Only `id` + `worldPos` are required; sensible GTA-like
 * defaults fill the rest. `kind` and `icon` are aliases (the brief said "kind/icon").
 */
export interface BlipInput {
  /** Stable unique key. Re-calling `addBlip` with the same id upserts (moves/restyles) the blip. */
  id: string;
  /** World position — `{x,z}`, `{x,y,z}`, a Vector3-like, or a tuple. */
  worldPos: WorldPos;
  /** Marker kind (drives colour + icon). Default `"poi"`. */
  kind?: BlipKind;
  /** Alias for `kind`. */
  icon?: BlipKind;
  /** Override the palette colour for this kind (any CSS colour). */
  color?: string;
  /** Short label shown on the full map (and in the minimap edge tooltip / a11y readout). */
  label?: string;
  /** Player can click this blip on the full map to set a route waypoint. Default `true`. */
  waypointable?: boolean;
  /** Show on the rotating minimap. Default `true`. */
  minimap?: boolean;
  /** Show on the full-screen map. Default `true`. */
  map?: boolean;
  /** Clamp to the minimap ring with a chevron when out of range. Default `true`. */
  clampToEdge?: boolean;
  /** Higher draws on top / survives culling first. Default `0`. */
  priority?: number;
  /** Pulsing "sonar" ring — good for objectives / pings. Default `false`. */
  sonar?: boolean;
  /** World Y for the above/below height caret on the minimap (else taken from `worldPos.y`). */
  height?: number;
}

/** Normalized internal blip record (what the store holds + the canvas reads). */
export interface MapBlip {
  id: string;
  x: number;
  z: number;
  y?: number;
  kind: BlipKind;
  color?: string;
  label?: string;
  waypointable: boolean;
  minimap: boolean;
  map: boolean;
  clampToEdge: boolean;
  priority: number;
  sonar: boolean;
}

/** A* result over the city road graph (world-space polyline + total length). */
export interface RouteResult {
  ok: boolean;
  /** World polyline from origin → destination (empty when `ok` is false). */
  path: Vec2[];
  /** Total length in metres (Infinity when unreachable). */
  distance: number;
}

/** Snapshot of the local player, read from the ECS each frame (mutated in place, zero-alloc). */
export interface PlayerCam {
  x: number;
  y: number;
  z: number;
  /** Visual yaw in radians (ECS `movement.facing`). */
  heading: number;
  /** Planar speed, m/s. */
  speed: number;
  valid: boolean;
}

/** Coerce any accepted position shape to `{x,z}` (+ optional height `y`). */
export function normalizeWorldPos(p: WorldPos): { x: number; z: number; y?: number } {
  if (Array.isArray(p)) {
    // [x,z] or [x,y,z]
    return p.length >= 3
      ? { x: p[0], y: p[1], z: p[2] as number }
      : { x: p[0], z: p[1] as number };
  }
  const o = p as { x: number; y?: number; z: number };
  return o.y === undefined ? { x: o.x, z: o.z } : { x: o.x, y: o.y, z: o.z };
}
