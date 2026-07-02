// render/city (client) — procedural City Generation for Santa Vista.
// Self-registers on import (systems-loader picks up this root index automatically).
//
// • Emits a deterministic map.json-style dataset (roads → blocks → lots → buildings → props →
//   colliders → spawns → tiles) from a seed.
// • Renders it as instanced building meshes (BatchedMesh) + InstancedMesh props + merged roads,
//   hung on ECS entities' `three` view components (rendered by the shared ECS↔R3F bridge).
// • Exposes the road graph + full map both on the ECS (city_map / city_graph) and via the
//   public API in ./public for traffic / peds / minimap / physics.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./city.components"; // ECS declaration merging (city_* fields)
import { citySystems, initCity } from "./render";

type W = typeof world;

export const city: SubsystemModule<W> = {
  id: "render/city",
  systems: citySystems,
  init: initCity,
};

registerModule(city);

export * from "./public";
