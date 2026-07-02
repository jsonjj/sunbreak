// content/data-format — map / world content schema.
//
// A `MapChunk` is the streamable unit of the world (roughly one district block). It carries
// props, spawn points, POIs, an optional road graph, and district/zone metadata. Consumed by
// World Streaming / Rendering (props + bounds), AI/Traffic (road graph + spawns), and Missions
// (POIs linking to missions). Kept permissive: only `id` is required; everything else defaults.
import { z } from "zod";
import { AssetRef, Bounds, Id, Transform, Vec2, Vec3, withEnvelope } from "./primitives";

/** Collider approximation the physics/streaming layer builds for a prop. */
export const ColliderKind = z.enum(["none", "cuboid", "trimesh", "hull", "ball", "capsule"]);
export type ColliderKind = z.infer<typeof ColliderKind>;

/** A placed piece of world geometry. `instanceGroup` lets rendering batch identical models. */
export const Prop = z
  .object({
    id: Id,
    model: AssetRef,
    transform: Transform.default({}),
    collider: ColliderKind.default("cuboid"),
    static: z.boolean().default(true),
    instanceGroup: z.string().optional(),
    tint: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type Prop = z.infer<typeof Prop>;

/** What a spawn point produces. */
export const SpawnKind = z.enum(["player", "vehicle", "ped", "mission"]);
export type SpawnKind = z.infer<typeof SpawnKind>;

export const SpawnPoint = z
  .object({
    id: Id,
    kind: SpawnKind,
    transform: Transform.default({}),
    districtId: Id.optional(),
    /** Optional hints for vehicle/ped spawns (kept as free strings to avoid cross-enum coupling). */
    vehicleClass: z.string().optional(),
    pedArchetype: z.string().optional(),
    weight: z.number().nonnegative().default(1),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type SpawnPoint = z.infer<typeof SpawnPoint>;

/** Point-of-interest kind (map blips / interactables). */
export const PoiKind = z.enum([
  "generic",
  "shop",
  "interior",
  "mission",
  "garage",
  "safehouse",
  "hospital",
  "gasstation",
  "viewpoint",
  "stunt",
  "property",
]);
export type PoiKind = z.infer<typeof PoiKind>;

export const Poi = z
  .object({
    id: Id,
    kind: PoiKind.default("generic"),
    name: z.string().optional(),
    transform: Transform.default({}),
    radius: z.number().nonnegative().default(2),
    /** Cross-file links resolved by the ref-integrity pass. */
    links: z
      .object({
        missionId: Id.optional(),
        shopId: Id.optional(),
        interiorId: Id.optional(),
        npcId: Id.optional(),
      })
      .passthrough()
      .default({}),
    icon: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type Poi = z.infer<typeof Poi>;

// ── Road graph (authored now, consumed by traffic AI later) ────────────────────
export const RoadNode = z
  .object({
    id: Id,
    pos: Vec3,
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type RoadNode = z.infer<typeof RoadNode>;

export const RoadType = z.enum(["street", "avenue", "highway", "alley", "dirt", "ramp", "bridge"]);
export type RoadType = z.infer<typeof RoadType>;

/**
 * A road as a polyline. Points may be given inline (`points`) and/or by referencing
 * `RoadNode` ids (`nodeIds`) — both are optional so either authoring style validates.
 */
export const RoadSegment = z
  .object({
    id: Id,
    points: z.array(Vec3).default([]),
    nodeIds: z.array(Id).default([]),
    lanes: z.number().int().positive().default(2),
    width: z.number().positive().default(7),
    type: RoadType.default("street"),
    speedLimit: z.number().positive().default(50), // km/h
    oneway: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type RoadSegment = z.infer<typeof RoadSegment>;

// ── Regions ────────────────────────────────────────────────────────────────────
export const District = z
  .object({
    id: Id,
    name: z.string(),
    polygon: z.array(Vec2).default([]),
    music: z.string().optional(), // radio station id / ambience ref
    wantedBias: z.number().default(0),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type District = z.infer<typeof District>;

export const Zone = z
  .object({
    id: Id,
    kind: z.string().default("generic"),
    polygon: z.array(Vec2).default([]),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();
export type Zone = z.infer<typeof Zone>;

// ── Aggregate ────────────────────────────────────────────────────────────────
/** The streamable world unit. `schema: "sunbreak.map"`. */
export const MapChunk = withEnvelope("sunbreak.map", {
  districtId: Id.optional(),
  name: z.string().optional(),
  bounds: Bounds.optional(),
  roads: z.array(RoadSegment).default([]),
  roadNodes: z.array(RoadNode).default([]),
  spawns: z.array(SpawnPoint).default([]),
  pois: z.array(Poi).default([]),
  props: z.array(Prop).default([]),
  districts: z.array(District).default([]),
  zones: z.array(Zone).default([]),
});
export type MapChunk = z.infer<typeof MapChunk>;
