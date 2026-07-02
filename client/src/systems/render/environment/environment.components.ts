// ECS component augmentation for the environment subsystem. Every field is prefixed `env_`,
// optional, and a serialisable POJO (live THREE refs ride on the client-only `three` view
// component). This is the ONLY sanctioned way we extend the shared entity — no edits to shared.

import type { EnvKind } from "./constants";
import type { EnvBiomeId } from "./biomes";
import type { EnvHeightfield } from "./heightfield";
import type { EnvColliderDesc } from "./props";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** What this environment entity is (terrain/ocean/wetland/heroWater/foliage/props/heightfield). */
    env_kind?: EnvKind;
    /** Biome tag for gameplay/audio queries. */
    env_biome?: EnvBiomeId;
    /** Terrain tile coordinates (for streaming/debug). */
    env_tile?: { cx: number; cz: number };
    /** Never moves — a hint for spatial systems. */
    env_static?: true;
    /** Water surface elevation (metres) for gameplay grounding/swim checks. */
    env_waterLevel?: number;
    /** Consolidated heightfield rows → physics builds a Rapier heightfield collider. */
    env_heightfield?: EnvHeightfield;
    /** Static prop colliders (rocks/pilings) → physics builds fixed colliders for cover. */
    env_colliders?: EnvColliderDesc[];
    /** Marks the environment as fully built. */
    env_ready?: true;
  }
}

export {};
