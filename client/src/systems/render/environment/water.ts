// Water build. Two-tier system per the spec: (1) a cheap, env-map-free ShaderMaterial ocean +
// murky wetland everywhere (fresnel + fake-sky reflection + depth shore/foam), and (2) exactly
// ONE planar MeshReflector-style hero surface for the bay (three's Reflector), gated to
// medium/high and throttled by wrapping its onBeforeRender so the planar pass is the only cost.

import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import {
  BAY_CENTER,
  BAY_RADIUS,
  BUILT_HALF,
  GLADES_CENTER,
  GLADES_RADIUS,
  GLADES_WATER_LEVEL,
  WATER_LEVEL,
  type EnvQualitySettings,
} from "./constants";
import { makeWaterMaterial } from "./shaders";
import type { HeightTextureResult } from "./textures";

export interface WaterTextures {
  height: HeightTextureResult;
  normal: THREE.Texture;
  foam: THREE.Texture;
}

export interface WaterBuild {
  ocean: THREE.Mesh;
  wetland: THREE.Mesh;
  hero: Reflector | null;
  dispose(): void;
}

/** Flat grid in the XZ plane at local y = 0, uv 0..1. */
function buildWaterPlane(size: number, segments: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingSphere();
  return geo;
}

export function buildWater(tex: WaterTextures, tier: EnvQualitySettings): WaterBuild {
  // --- Open ocean (extends well past the built terrain toward the horizon) ---
  const oceanSize = Math.max(4000, BUILT_HALF * 6);
  const oceanGeo = buildWaterPlane(oceanSize, tier.oceanSegments);
  const oceanMat = makeWaterMaterial("ocean", tex.height, tex.normal, tex.foam);
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.name = "env:ocean";
  ocean.position.set(0, WATER_LEVEL, 0);
  ocean.renderOrder = 1;
  ocean.frustumCulled = false;

  // --- Glades wetland (murky, non-reflective, translucent) ---
  const wetSize = GLADES_RADIUS * 2.4;
  const wetGeo = buildWaterPlane(wetSize, 48);
  const wetMat = makeWaterMaterial("wetland", tex.height, tex.normal, tex.foam);
  const wetland = new THREE.Mesh(wetGeo, wetMat);
  wetland.name = "env:wetland";
  wetland.position.set(GLADES_CENTER.x, GLADES_WATER_LEVEL, GLADES_CENTER.z);
  wetland.renderOrder = 2;

  // --- Hero reflector (the single planar pass) ---
  let hero: Reflector | null = null;
  if (tier.reflector) {
    const geo = new THREE.CircleGeometry(BAY_RADIUS, 64);
    hero = new Reflector(geo, {
      color: 0x8a97a0,
      textureWidth: tier.reflectorRes,
      textureHeight: tier.reflectorRes,
      clipBias: 0.0035,
    });
    hero.name = "env:heroWater";
    hero.rotation.x = -Math.PI / 2;
    hero.position.set(BAY_CENTER.x, WATER_LEVEL + 0.04, BAY_CENTER.z);
    hero.renderOrder = 0;

    // Throttle the planar pass: reuse the last reflection texture on skipped frames (no flicker).
    const everyN = Math.max(1, tier.reflectorEveryNFrames);
    if (everyN > 1) {
      const orig = hero.onBeforeRender;
      let frame = 0;
      hero.onBeforeRender = function (this: Reflector, ...args: Parameters<typeof orig>) {
        if (frame++ % everyN === 0) orig.apply(this, args);
      };
    }
  }

  const dispose = () => {
    oceanGeo.dispose();
    oceanMat.dispose();
    wetGeo.dispose();
    wetMat.dispose();
    if (hero) {
      hero.dispose();
      hero.geometry.dispose();
    }
  };

  return { ocean, wetland, hero, dispose };
}
