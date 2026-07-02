// render/environment (client) — SUNBREAK terrain / water / foliage / props.
// Self-registers via registerModule() at module top level (auto-imported by systems-loader).
// Implements the Environment & Terrain subsystem per gta6-build/01-render/environment-terrain.md.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

import "./environment.components"; // ECS augmentation (env_* fields)
import { environmentSystems } from "./systems";
import { disposeEnvironment } from "./build";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "render/environment",
  systems: environmentSystems,
  init() {
    // Heavy build happens lazily on the first render tick (env/boot) / <EnvironmentView> mount.
    return () => disposeEnvironment();
  },
};

registerModule(mod); // REQUIRED side effect

// ---- Public surface for the integrator + sibling subsystems ------------------------------
export { EnvironmentView } from "./EnvironmentView";
export {
  environmentApi,
  getEnvironmentApi,
  useEnvironment,
  sampleHeight,
  sampleNormal,
  sampleSlope,
  surfaceAt,
  buildHeightfield,
  heightfieldRows,
} from "./api";
export type { EnvironmentApi, EnvHeightfield, SurfaceSample, EnvColliderDesc } from "./api";
export { ensureEnvironmentBuilt, disposeEnvironment, getEnvBuild } from "./build";
