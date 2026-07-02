// OPTIONAL drop-in R3F bridge. A SubsystemModule can't mount React under <Canvas>, and the app
// doesn't yet mount a generic ECS `three` bridge — so the integrator can drop this ONE component
// inside the R3F <Canvas> (e.g. in game/Scene.tsx) to render every environment entity's `three`
// view object. Mount EITHER this OR a generic `world.with("three")` bridge — not both.

import { useEffect } from "react";
import { ECS, world } from "@/ecs/world";
import { ensureEnvironmentBuilt } from "./build";

const envRenderables = world.with("three", "env_kind");

export function EnvironmentView() {
  useEffect(() => {
    ensureEnvironmentBuilt();
  }, []);

  return (
    <ECS.Entities in={envRenderables}>
      {(entity) => (entity.three ? <primitive object={entity.three} dispose={null} /> : null)}
    </ECS.Entities>
  );
}
