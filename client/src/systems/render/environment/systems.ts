// ECS systems (run by the shared SystemsRunner each frame — only (world, dt) is provided, no
// scene handle, so these only MUTATE already-built objects; mounting is done via the `three`
// bridge). Phases used: render (build/animate/stream) + finish (adaptive quality).

import type * as THREE from "three";
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { ENV_TIERS } from "./constants";
import { useEnvironment } from "./api";
import { windUniforms, waterMaterials } from "./shaders";
import { ensureEnvironmentBuilt, getEnvBuild, envRuntime } from "./build";

type W = typeof world;

/** Player position drives streaming/culling. Same archetype the core uses (isPlayer + transform). */
const players = world.with("isPlayer", "transform");

let clock = 0;
let streamAcc = 0;
let fpsEma = 60;

function playerXZ(): { x: number; z: number } {
  const pos = players.entities[0]?.transform?.position;
  return pos ? { x: pos.x, z: pos.z } : { x: 0, z: 0 };
}

/** Build the world once, on the first render tick after the Canvas exists. Idempotent.
 *  We attempt the (heavy, deterministic) build EXACTLY ONCE: retrying on failure would just
 *  redo the same work and throw again every frame — a CPU sink — since nothing it depends on
 *  changes between frames. A throw here is isolated by the SystemRegistry and logged once. */
let bootAttempted = false;
const bootSystem: System<W> = {
  name: "env/boot",
  phase: "render",
  order: -1000,
  fn: () => {
    if (bootAttempted || getEnvBuild()) return;
    bootAttempted = true;
    ensureEnvironmentBuilt();
  },
};

/** Advance water + wind shader time. */
const animateSystem: System<W> = {
  name: "env/animate",
  phase: "render",
  order: 10,
  fn: (_w, dt) => {
    if (!getEnvBuild()) return;
    clock += dt;
    windUniforms.uWindTime.value = clock;
    for (const m of waterMaterials) {
      const u = m.uniforms.uTime;
      if (u) u.value = clock;
    }
  },
};

/** Distance-cull terrain tiles + foliage cells around the player; apply reflector toggle. */
const streamSystem: System<W> = {
  name: "env/stream",
  phase: "render",
  order: 20,
  fn: (_w, dt) => {
    const build = getEnvBuild();
    if (!build) return;
    streamAcc += dt;
    if (streamAcc < 0.15) return;
    streamAcc = 0;

    const tier = ENV_TIERS[useEnvironment.getState().tier];
    const { x: px, z: pz } = playerXZ();

    const tdd2 = tier.terrainDrawDistance * tier.terrainDrawDistance;
    for (const t of build.terrain?.tiles ?? []) {
      const dx = t.center.x - px;
      const dz = t.center.z - pz;
      t.mesh.visible = dx * dx + dz * dz < tdd2;
    }

    const fdd = tier.foliageDrawDistance * envRuntime.foliageDistScale;
    const fdd2 = fdd * fdd;
    for (const s of build.foliage) {
      for (const child of s.group.children) {
        const c = child.userData.cullCenter as THREE.Vector3 | undefined;
        if (!c) continue;
        const dx = c.x - px;
        const dz = c.z - pz;
        child.visible = dx * dx + dz * dz < fdd2;
      }
    }

    if (build.water?.hero) build.water.hero.visible = envRuntime.reflectorOn;
  },
};

/** Cheap FPS-driven auto quality: throttle foliage distance + reflector when frame time spikes. */
const adaptiveSystem: System<W> = {
  name: "env/adaptive",
  phase: "finish",
  order: 50,
  fn: (_w, dt) => {
    if (!getEnvBuild()) return;
    const tier = ENV_TIERS[useEnvironment.getState().tier];
    if (!useEnvironment.getState().autoQuality) {
      envRuntime.foliageDistScale = 1;
      envRuntime.reflectorOn = tier.reflector;
      return;
    }
    const inst = 1 / Math.max(dt, 1e-3);
    fpsEma += (inst - fpsEma) * 0.05;
    if (fpsEma < 30) {
      envRuntime.foliageDistScale = 0.55;
      envRuntime.reflectorOn = false;
    } else if (fpsEma < 45) {
      envRuntime.foliageDistScale = 0.8;
      envRuntime.reflectorOn = tier.reflector;
    } else {
      envRuntime.foliageDistScale = 1;
      envRuntime.reflectorOn = tier.reflector;
    }
  },
};

export const environmentSystems: System<W>[] = [
  bootSystem,
  animateSystem,
  streamSystem,
  adaptiveSystem,
];
