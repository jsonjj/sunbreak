// ECS augmentation for the render/city subsystem (declaration merging — never edits shared).
// Every field is `city_`-prefixed and optional/tag-only, per the Wave-2 contract. The road
// graph + full map are exposed as serializable POJO components on a singleton entity so ANY
// subsystem can read them purely through the shared ECS world (no cross-folder import needed).
import type { CityMapDoc, RoadGraph } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Singleton: the full generated city artifact (serializable "map.json"). */
    city_map?: CityMapDoc;
    /** Singleton: the road network graph (nodes/edges) for traffic/peds/wanted routing. */
    city_graph?: RoadGraph;
    /** Tag: city generation finished and the map/graph components are populated. */
    city_ready?: true;
    /** Tag: this entity carries a city render group on its `three` view component. */
    city_render?: true;
    /** Tile id a render/region entity covers (-1 = whole-city root group). */
    city_tile?: number;
    /** Landmark id for a hero-model entity (e.g. "solaris_tower"). */
    city_landmark?: string;
  }
}

export {};
