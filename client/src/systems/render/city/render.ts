// Render-phase system + lifecycle for render/city.
//
// Data channel (init, runs at registration): generate the deterministic doc and mirror it onto
// a singleton ECS entity (`city_map` + `city_graph`) so ANY subsystem reads the road graph
// straight from the shared world — the pure-contract integration path.
//
// View channel (render phase, first tick): build the THREE city into one group and hang it on
// an ECS entity's `three` view component. The central ECS↔R3F bridge renders every entity that
// has a `three` component (see integrator note below) — we never hand-mount into App/Scene.
import * as THREE from "three";
import { identityTransform, type System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { NEON_PULSE_HZ } from "./config";
import { ensureCityMap } from "./store";
import { createCityMaterials, type CityMaterials } from "./materials";
import { buildCity, type CityBuild } from "./mesh";

type W = typeof world;

interface CityRuntime {
  materials: CityMaterials | null;
  build: CityBuild | null;
  neonBase: THREE.Color | null;
  dataEntity: ClientEntity | null;
  rootEntity: ClientEntity | null;
  elapsed: number;
  framesUnparented: number;
  warned: boolean;
  failed: boolean;
}

const rt: CityRuntime = {
  materials: null,
  build: null,
  neonBase: null,
  dataEntity: null,
  rootEntity: null,
  elapsed: 0,
  framesUnparented: 0,
  warned: false,
  failed: false,
};

/** One-time init (registration): generate the doc and expose it via the ECS + store. */
export function initCity(): () => void {
  const doc = ensureCityMap();
  const dataEntity: ClientEntity = {
    city_map: doc,
    city_graph: doc.roads,
    city_ready: true,
    isActive: true,
  };
  world.add(dataEntity);
  rt.dataEntity = dataEntity;
  return cleanupCity;
}

function cleanupCity(): void {
  if (rt.rootEntity) {
    world.remove(rt.rootEntity);
    rt.rootEntity = null;
  }
  if (rt.dataEntity) {
    world.remove(rt.dataEntity);
    rt.dataEntity = null;
  }
  rt.build?.dispose();
  rt.materials?.dispose();
  rt.build = null;
  rt.materials = null;
  rt.neonBase = null;
}

function buildOnce(): void {
  const doc = rt.dataEntity?.city_map ?? ensureCityMap();
  const materials = createCityMaterials();
  const build = buildCity(doc, materials);
  rt.materials = materials;
  rt.build = build;
  rt.neonBase = materials.landmarkNeon.color.clone();

  const rootEntity: ClientEntity = {
    city_render: true,
    city_tile: -1,
    transform: identityTransform(),
    three: build.root,
  };
  world.add(rootEntity);
  rt.rootEntity = rootEntity;

  if (import.meta.env.DEV) {
    console.info(
      `[render/city] built Santa Vista — ${build.buildingCount} buildings, ~${build.drawGroups} draw groups, ${doc.props.reduce((s, g) => s + g.count, 0)} props.`,
    );
  }
}

const INTEGRATOR_HINT =
  '[render/city] city root has no scene parent after ~3s. Mount the ECS↔R3F bridge once (integrator seam), e.g. inside <Canvas>: ' +
  '<ECS.Entities in={world.with("three")}>{(e) => <primitive object={e.three!} dispose={null} />}</ECS.Entities>. ' +
  "The city is generated and exposed on the ECS (world.with('city_map')); it only needs the shared three-view renderer.";

const cityRenderSystem: System<W> = {
  name: "render/city:render",
  phase: "render",
  order: -50,
  fn: (_world, dt) => {
    if (rt.failed) return;
    if (!rt.build) {
      try {
        buildOnce();
      } catch (err) {
        rt.failed = true;
        if (import.meta.env.DEV) console.error("[render/city] build failed:", err);
      }
      return;
    }

    rt.elapsed += dt;

    // City-wide neon pulse — cheap material tweak, justifies the per-frame render system.
    const wave = 0.5 + 0.5 * Math.sin(rt.elapsed * NEON_PULSE_HZ * Math.PI * 2);
    if (rt.materials) {
      rt.materials.buildingNeon.color.setScalar(0.82 + 0.34 * wave); // multiplies vertex colors
      if (rt.neonBase) {
        rt.materials.landmarkNeon.color.copy(rt.neonBase).multiplyScalar(0.9 + 0.5 * wave);
      }
    }

    // Integrator-seam watchdog: if nothing mounted our `three` view, say so once (DEV only).
    const root = rt.build.root;
    if (!root.parent) {
      rt.framesUnparented++;
      if (rt.framesUnparented === 180 && !rt.warned && import.meta.env.DEV) {
        rt.warned = true;
        console.warn(INTEGRATOR_HINT);
      }
    } else {
      rt.framesUnparented = 0;
    }
  },
};

export const citySystems: ReadonlyArray<System<W>> = [cityRenderSystem];
