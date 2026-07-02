// Build orchestrator. Constructs every THREE object once (procedural textures → terrain → water
// → foliage → props), attaches them to ECS entities via the client-only `three` view component,
// and publishes physics data (heightfield + colliders). Idempotent: safe to call from the boot
// system AND from <EnvironmentView> mount. Nothing here mounts into App/Scene or the v0 renderer.

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { GLADES_WATER_LEVEL, WATER_LEVEL, ENV_TIERS } from "./constants";
import { useEnvironment } from "./api";
import {
  makeDetailAlbedo,
  makeDetailNormal,
  makeRoughness,
  makeWaterNormal,
  makeFoamTexture,
  makeHeightTexture,
} from "./textures";
import { buildTerrain, type TerrainBuild } from "./terrain";
import { buildWater, type WaterBuild } from "./water";
import { buildFoliage, type FoliageSpecies } from "./foliage";
import { buildProps, type PropsBuild } from "./props";
import { buildHeightfield } from "./heightfield";

export interface EnvBuild {
  entities: ClientEntity[];
  /** Any section may be null if its build failed — the rest of the world still comes up. */
  terrain: TerrainBuild | null;
  water: WaterBuild | null;
  foliage: FoliageSpecies[];
  props: PropsBuild | null;
  dispose(): void;
}

/** Adaptive-quality knobs mutated by the adaptive system, read by the streaming system. */
export const envRuntime = { foliageDistScale: 1, reflectorOn: true };

let built: EnvBuild | null = null;

/** Sections that have already failed once — so a fault is logged a single time, never per frame. */
const buildFaults = new Set<string>();

export function getEnvBuild(): EnvBuild | null {
  return built;
}

/** Run one build section in isolation: on failure, log once and return null so the rest still builds. */
function safeBuild<T>(label: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    if (!buildFaults.has(label)) {
      buildFaults.add(label);
      console.error(
        `[env] failed to build "${label}"; skipping it so the rest of the environment still comes up:`,
        err,
      );
    }
    return null;
  }
}

export function ensureEnvironmentBuilt(): EnvBuild {
  if (built) return built;

  const tier = ENV_TIERS[useEnvironment.getState().tier];

  // Every section is fault-isolated: a throw in one piece (a bad geometry, a failed texture, …) is
  // logged once and skipped rather than aborting the whole build. env/boot attempts this exactly
  // once, so a partial world never re-throws frame after frame.
  const albedo = safeBuild("tex:albedo", makeDetailAlbedo);
  const normal = safeBuild("tex:normal", makeDetailNormal);
  const roughness = safeBuild("tex:roughness", makeRoughness);
  const heightTex = safeBuild("tex:height", () => makeHeightTexture(256));
  const waterNormal = safeBuild("tex:waterNormal", makeWaterNormal);
  const foam = safeBuild("tex:foam", makeFoamTexture);

  const terrain =
    albedo && normal && roughness
      ? safeBuild("terrain", () => buildTerrain({ albedo, normal, roughness }, tier))
      : null;
  const water =
    heightTex && waterNormal && foam
      ? safeBuild("water", () => buildWater({ height: heightTex, normal: waterNormal, foam }, tier))
      : null;
  const foliage = safeBuild("foliage", () => buildFoliage(tier)) ?? [];
  const props = safeBuild("props", () => buildProps(tier));
  const colliders = props?.colliders ?? [];

  const entities: ClientEntity[] = [];
  const add = (e: ClientEntity): void => {
    entities.push(world.add(e));
  };

  if (terrain) add({ env_kind: "terrain", env_static: true, three: terrain.group });
  if (water) {
    add({ env_kind: "ocean", env_static: true, env_waterLevel: WATER_LEVEL, three: water.ocean });
    add({
      env_kind: "wetland",
      env_static: true,
      env_waterLevel: GLADES_WATER_LEVEL,
      three: water.wetland,
    });
    if (water.hero) {
      add({
        env_kind: "heroWater",
        env_static: true,
        env_waterLevel: WATER_LEVEL,
        three: water.hero,
      });
    }
  }
  for (const s of foliage) {
    add({ env_kind: "foliage", env_static: true, three: s.group });
  }
  if (props) {
    add({ env_kind: "props", env_static: true, three: props.group, env_colliders: colliders });
  }

  // Data-only entity (no `three`) exposing physics inputs via the shared ECS.
  const heightfield = safeBuild("heightfield", buildHeightfield);
  const heightfieldEntity: ClientEntity = {
    env_kind: "heightfield",
    env_static: true,
    env_colliders: colliders,
    env_ready: true,
  };
  if (heightfield) heightfieldEntity.env_heightfield = heightfield;
  add(heightfieldEntity);

  envRuntime.reflectorOn = !!water?.hero;
  useEnvironment.getState()._setColliders(colliders);
  useEnvironment.getState()._setReady(true);

  const dispose = (): void => {
    for (const e of entities) world.remove(e);
    entities.length = 0;
    terrain?.dispose();
    water?.dispose();
    for (const s of foliage) {
      // Release each cell's InstancedMesh GPU buffers before the shared geo/material.
      for (const child of s.group.children) {
        const im = child as { isInstancedMesh?: boolean; dispose?: () => void };
        if (im.isInstancedMesh && im.dispose) im.dispose();
      }
      s.dispose();
    }
    props?.dispose();
    heightTex?.texture.dispose();
    waterNormal?.dispose();
    foam?.dispose();
    // terrain.dispose() owns the albedo/normal/roughness textures; free them here only if terrain
    // never took ownership (its build failed or was skipped).
    if (!terrain) {
      albedo?.dispose();
      normal?.dispose();
      roughness?.dispose();
    }
    built = null;
    useEnvironment.getState()._setReady(false);
  };

  built = { entities, terrain, water, foliage, props, dispose };
  return built;
}

export function disposeEnvironment(): void {
  built?.dispose();
}
