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
  terrain: TerrainBuild;
  water: WaterBuild;
  foliage: FoliageSpecies[];
  props: PropsBuild;
  dispose(): void;
}

/** Adaptive-quality knobs mutated by the adaptive system, read by the streaming system. */
export const envRuntime = { foliageDistScale: 1, reflectorOn: true };

let built: EnvBuild | null = null;

export function getEnvBuild(): EnvBuild | null {
  return built;
}

export function ensureEnvironmentBuilt(): EnvBuild {
  if (built) return built;

  const tier = ENV_TIERS[useEnvironment.getState().tier];

  const albedo = makeDetailAlbedo();
  const normal = makeDetailNormal();
  const roughness = makeRoughness();
  const heightTex = makeHeightTexture(256);
  const waterNormal = makeWaterNormal();
  const foam = makeFoamTexture();

  const terrain = buildTerrain({ albedo, normal, roughness }, tier);
  const water = buildWater({ height: heightTex, normal: waterNormal, foam }, tier);
  const foliage = buildFoliage(tier);
  const props = buildProps(tier);

  const entities: ClientEntity[] = [];
  const add = (e: ClientEntity): void => {
    entities.push(world.add(e));
  };

  add({ env_kind: "terrain", env_static: true, three: terrain.group });
  add({ env_kind: "ocean", env_static: true, env_waterLevel: WATER_LEVEL, three: water.ocean });
  add({
    env_kind: "wetland",
    env_static: true,
    env_waterLevel: GLADES_WATER_LEVEL,
    three: water.wetland,
  });
  if (water.hero) {
    add({ env_kind: "heroWater", env_static: true, env_waterLevel: WATER_LEVEL, three: water.hero });
  }
  for (const s of foliage) {
    add({ env_kind: "foliage", env_static: true, three: s.group });
  }
  add({ env_kind: "props", env_static: true, three: props.group, env_colliders: props.colliders });

  // Data-only entity (no `three`) exposing physics inputs via the shared ECS.
  add({
    env_kind: "heightfield",
    env_static: true,
    env_heightfield: buildHeightfield(),
    env_colliders: props.colliders,
    env_ready: true,
  });

  envRuntime.reflectorOn = !!water.hero;
  useEnvironment.getState()._setColliders(props.colliders);
  useEnvironment.getState()._setReady(true);

  const dispose = (): void => {
    for (const e of entities) world.remove(e);
    entities.length = 0;
    terrain.dispose();
    water.dispose();
    for (const s of foliage) {
      // Release each cell's InstancedMesh GPU buffers before the shared geo/material.
      for (const child of s.group.children) {
        const im = child as { isInstancedMesh?: boolean; dispose?: () => void };
        if (im.isInstancedMesh && im.dispose) im.dispose();
      }
      s.dispose();
    }
    props.dispose();
    heightTex.texture.dispose();
    waterNormal.dispose();
    foam.dispose();
    built = null;
    useEnvironment.getState()._setReady(false);
  };

  built = { entities, terrain, water, foliage, props, dispose };
  return built;
}

export function disposeEnvironment(): void {
  built?.dispose();
}
