// Runtime validation of the emitted map artifact. `types.ts` is the compile-time source of
// truth; this zod schema guards the data-driven format at load (DEV only, to avoid parsing a
// few thousand records on every production boot). Prop transforms stay plain number[] so the
// doc round-trips cleanly through JSON.
import { z } from "zod";
import type { CityMapDoc } from "./types";

const vec2 = z.object({ x: z.number(), z: z.number() });
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const roadClass = z.enum(["arterial", "collector", "local"]);
const zone = z.enum(["commercial", "residential", "industrial", "mixed"]);
const districtKey = z.enum([
  "miracle_row",
  "costa_dorada",
  "calle_sol",
  "the_mint",
  "north_park",
  "bayfront",
  "airfield",
]);

const roadGraph = z.object({
  nodes: z.array(z.object({ id: z.number(), x: z.number(), z: z.number() })),
  edges: z.array(
    z.object({
      a: z.number(),
      b: z.number(),
      klass: roadClass,
      width: z.number(),
      lanes: z.number(),
      length: z.number(),
    }),
  ),
});

const building = z.object({
  id: z.string(),
  lotId: z.string(),
  tile: z.number(),
  district: districtKey,
  center: vec2,
  width: z.number(),
  depth: z.number(),
  rotationY: z.number(),
  floors: z.number(),
  height: z.number(),
  kitSet: z.string(),
  style: z.string(),
  color: z.string(),
  emissive: z.boolean(),
  glass: z.boolean(),
  setbackTop: z.boolean(),
});

const propGroup = z.object({
  type: z.enum(["streetlight", "tree", "hydrant", "bench", "trafficlight"]),
  count: z.number(),
  matrices: z.array(z.number()),
  tiles: z.array(z.number()),
});

const collider = z.object({
  kind: z.literal("cuboid"),
  tile: z.number(),
  halfExtents: vec3,
  position: vec3,
  rotationY: z.number(),
  tag: z.enum(["building", "ground", "landmark"]),
});

const spawn = z.object({
  id: z.string(),
  kind: z.enum(["player", "vehicle", "ped"]),
  position: vec3,
  yaw: z.number(),
});

/** Structural schema for the emitted city document. */
export const CityMapDocSchema = z.object({
  version: z.literal(1),
  seed: z.number(),
  bounds: z.object({ min: vec2, max: vec2 }),
  tileSize: z.number(),
  roads: roadGraph,
  districts: z.array(z.object({ key: districtKey, name: z.string() }).passthrough()),
  blocks: z.array(z.object({ id: z.number(), tile: z.number() }).passthrough()),
  lots: z.array(z.object({ id: z.string(), zone }).passthrough()),
  buildings: z.array(building),
  props: z.array(propGroup),
  sidewalks: z.array(z.object({ a: vec2, b: vec2, width: z.number() })),
  crosswalks: z.array(z.object({ id: z.number(), node: z.number(), at: vec2 }).passthrough()),
  landmarks: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
  colliders: z.array(collider),
  spawns: z.array(spawn),
  tiles: z.object({ size: z.number(), cols: z.number(), rows: z.number() }).passthrough(),
});

/**
 * Validate + narrow a candidate doc. Throws a zod error if the shape is wrong. Callers should
 * gate this behind `import.meta.env.DEV` — the generator already produces valid data, so this
 * is a development-time guard against schema drift, not a hot-path cost.
 */
export function validateMapDoc(doc: unknown): CityMapDoc {
  CityMapDocSchema.parse(doc);
  return doc as CityMapDoc;
}
