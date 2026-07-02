// Material factories. No `three-custom-shader-material` (not installed) — we inject wind into
// MeshStandardMaterial via onBeforeCompile (keeps full PBR + shadows) and build the ocean as a
// self-contained ShaderMaterial (fresnel + fake-sky reflection + depth-based shore/foam), so the
// water needs no PMREM/HDRI env map (none exists in v0) and no scene depth pass.

import * as THREE from "three";
import { TILE_SIZE } from "./constants";
import { WATER_TINT } from "./biomes";
import type { HeightTextureResult } from "./textures";

// ---- Shared, animatable uniform refs (one object, shared across every material instance) ----

export const windUniforms = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 0.22 },
  uWindSpeed: { value: 1.3 },
  uWindHeight: { value: 1.7 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.28).normalize() },
};

/** Sun direction shared by every water material (integrator can sync it to the real sun). */
export const sunUniform = { value: new THREE.Vector3(0.45, 0.82, 0.36).normalize() };

/** Every water material created — the animation system bumps their uTime each frame. */
export const waterMaterials: THREE.ShaderMaterial[] = [];

// ---- Wind-enabled PBR material (foliage) -------------------------------------------------

export interface WindMaterialOptions {
  map?: THREE.Texture;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  alphaTest?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  windStrength?: number;
}

export function makeWindMaterial(opts: WindMaterialOptions): THREE.MeshStandardMaterial {
  // Only pass `map` when a texture actually exists. Passing `map: undefined` makes three log
  // "THREE.Material: parameter 'map' has value of undefined." (vertex-coloured foliage has no map).
  const params: THREE.MeshStandardMaterialParameters = {
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 0.85,
    metalness: 0,
    side: opts.side ?? THREE.DoubleSide,
    alphaTest: opts.alphaTest ?? 0,
    vertexColors: opts.vertexColors ?? false,
  };
  if (opts.map) params.map = opts.map;
  const m = new THREE.MeshStandardMaterial(params);
  const localStrength = opts.windStrength ?? 1;

  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindSpeed = windUniforms.uWindSpeed;
    shader.uniforms.uWindHeight = windUniforms.uWindHeight;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uWindLocal = { value: localStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uWindTime; uniform float uWindStrength; uniform float uWindSpeed;
         uniform float uWindHeight; uniform vec2 uWindDir; uniform float uWindLocal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         {
           float wh = clamp(transformed.y / uWindHeight, 0.0, 1.0);
           wh = wh * wh;
           vec3 iPos = vec3(0.0);
           #ifdef USE_INSTANCING
             iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           #endif
           // Per-instance phase derived from world position (no custom attribute needed).
           float phase = iPos.x * 0.35 + iPos.z * 0.27;
           float s1 = sin(uWindTime * uWindSpeed + phase);
           float s2 = sin(uWindTime * uWindSpeed * 2.3 + phase * 1.7);
           float sway = (s1 + 0.4 * s2) * uWindStrength * uWindLocal * wh;
           transformed.x += sway * uWindDir.x;
           transformed.z += sway * uWindDir.y;
           transformed.x += cos(uWindTime * uWindSpeed * 0.7 + phase) * uWindStrength * uWindLocal * 0.35 * wh;
         }`,
      );
  };
  return m;
}

// ---- Terrain PBR material (baked splat via vertex colours + procedural detail maps) -------

export interface TerrainTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
}

export function makeTerrainMaterial(tex: TerrainTextures): THREE.MeshStandardMaterial {
  const detailRepeat = TILE_SIZE / 4; // ~4 m tiling; integer → seamless across tiles
  for (const t of [tex.albedo, tex.normal, tex.roughness]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(detailRepeat, detailRepeat);
    t.needsUpdate = true;
  }
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: tex.albedo,
    normalMap: tex.normal,
    roughnessMap: tex.roughness,
    roughness: 1,
    metalness: 0,
  });
  m.normalScale.set(0.55, 0.55);
  return m;
}

// ---- Water (ocean / bay / wetland) -------------------------------------------------------

export type WaterVariant = "ocean" | "bay" | "wetland";

const WATER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vUv;

  const vec2 D1 = vec2(0.86, 0.51);
  const vec2 D2 = vec2(-0.42, 0.90);
  const vec2 D3 = vec2(0.10, -0.99);

  float waveY(vec2 p) {
    float y = 0.0;
    y += sin(dot(p, D1) * 0.045 + uTime * 0.9) * 1.0;
    y += sin(dot(p, D2) * 0.083 + uTime * 1.35) * 0.5;
    y += sin(dot(p, D3) * 0.150 + uTime * 1.9) * 0.25;
    return y;
  }
  vec2 waveGrad(vec2 p) {
    vec2 g = vec2(0.0);
    g += D1 * (cos(dot(p, D1) * 0.045 + uTime * 0.9) * 1.0 * 0.045);
    g += D2 * (cos(dot(p, D2) * 0.083 + uTime * 1.35) * 0.5 * 0.083);
    g += D3 * (cos(dot(p, D3) * 0.150 + uTime * 1.9) * 0.25 * 0.150);
    return g;
  }

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    wp.y += waveY(p) * uWaveAmp;
    vec2 g = waveGrad(p) * uWaveAmp;
    vNormalW = normalize(vec3(-g.x, 1.0, -g.y));
    vWorldPos = wp.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSkyLow;
  uniform vec3 uSkyHigh;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunShine;
  uniform float uReflStrength;
  uniform sampler2D uNormalTex;
  uniform float uNormalScale;
  uniform vec2 uFlow;
  uniform sampler2D uHeightTex;
  uniform float uHeightMin;
  uniform float uHeightRange;
  uniform vec2 uWorldMin;
  uniform float uWorldSize;
  uniform float uWaterLevel;
  uniform float uShallowDepth;
  uniform sampler2D uFoamTex;
  uniform float uFoam;
  uniform float uFoamWidth;
  uniform float uMurk;

  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vUv;

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec2 uvw = vWorldPos.xz * 0.03;
    vec3 n1 = texture2D(uNormalTex, uvw + uFlow * uTime).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormalTex, uvw * 2.3 - uFlow * uTime * 1.7).xyz * 2.0 - 1.0;
    vec3 rn = normalize(n1 + n2);
    vec3 N = normalize(vNormalW + vec3(rn.x, 0.0, rn.y) * uNormalScale);

    vec2 huv = (vWorldPos.xz - uWorldMin) / uWorldSize;
    float terrainH = uHeightMin;
    if (huv.x >= 0.0 && huv.x <= 1.0 && huv.y >= 0.0 && huv.y <= 1.0) {
      terrainH = uHeightMin + texture2D(uHeightTex, huv).r * uHeightRange;
    }
    float depth = uWaterLevel - terrainH;
    float shallow = smoothstep(0.0, uShallowDepth, depth);

    vec3 waterCol = mix(uShallow, uDeep, shallow);

    float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uSkyLow, uSkyHigh, clamp(R.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 col = mix(waterCol, sky, clamp(fres * uReflStrength, 0.0, 1.0));

    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    col += uSunColor * spec * uSunShine;

    float foamBand = (1.0 - smoothstep(0.0, uFoamWidth, depth)) * step(0.0, depth);
    float fnoise = texture2D(uFoamTex, vWorldPos.xz * 0.08 + vec2(uTime * 0.02)).r;
    float foam = clamp(foamBand * (0.5 + fnoise) - 0.12, 0.0, 1.0) * uFoam;
    col = mix(col, vec3(0.9, 0.95, 0.95), foam);

    col = mix(col, uDeep * 0.7, uMurk * (1.0 - shallow) * 0.6);

    float alpha = mix(0.62, uOpacity, shallow);
    alpha = max(alpha, foam);
    alpha *= smoothstep(-0.05, 0.18, depth);

    // Discard fully-transparent fragments so the huge water plane never WRITES DEPTH over land
    // (depthWrite is on for correct sorting between water bodies). Without this the invisible
    // plane z-fights the coplanar city ground/terrain — the real cause of "streets flood".
    if (alpha < 0.02) discard;

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function makeWaterMaterial(
  variant: WaterVariant,
  ht: HeightTextureResult,
  normalTex: THREE.Texture,
  foamTex: THREE.Texture,
  waterLevel: number,
): THREE.ShaderMaterial {
  const preset =
    variant === "wetland"
      ? {
          deep: WATER_TINT.wetland,
          shallow: WATER_TINT.wetlandShallow,
          refl: 0.15,
          murk: 1,
          opacity: 0.82,
          waveAmp: 0.06,
          normalScale: 0.35,
          sunShine: 0.35,
          shallowDepth: 1.2,
          foam: 0.25,
          foamWidth: 0.5,
          flow: new THREE.Vector2(0.004, 0.003),
        }
      : variant === "bay"
        ? {
            deep: WATER_TINT.bayDeep,
            shallow: WATER_TINT.bayShallow,
            refl: 0.9,
            murk: 0,
            opacity: 0.92,
            waveAmp: 0.16,
            normalScale: 0.5,
            sunShine: 1.1,
            shallowDepth: 2.4,
            foam: 0.8,
            foamWidth: 1.0,
            flow: new THREE.Vector2(0.006, 0.004),
          }
        : {
            deep: WATER_TINT.oceanDeep,
            shallow: WATER_TINT.oceanShallow,
            refl: 0.85,
            murk: 0,
            opacity: 0.93,
            waveAmp: 0.5,
            normalScale: 0.6,
            sunShine: 1.25,
            shallowDepth: 3.2,
            foam: 1,
            foamWidth: 1.4,
            flow: new THREE.Vector2(0.009, 0.006),
          };

  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: preset.opacity },
      uDeep: { value: new THREE.Color().setRGB(preset.deep[0]!, preset.deep[1]!, preset.deep[2]!) },
      uShallow: { value: new THREE.Color().setRGB(preset.shallow[0]!, preset.shallow[1]!, preset.shallow[2]!) },
      uSkyLow: { value: new THREE.Color().setRGB(0.62, 0.74, 0.82) },
      uSkyHigh: { value: new THREE.Color().setRGB(0.28, 0.46, 0.72) },
      uSunDir: sunUniform,
      uSunColor: { value: new THREE.Color().setRGB(1.0, 0.93, 0.78) },
      uSunShine: { value: preset.sunShine },
      uReflStrength: { value: preset.refl },
      uNormalTex: { value: normalTex },
      uNormalScale: { value: preset.normalScale },
      uFlow: { value: preset.flow },
      uHeightTex: { value: ht.texture },
      uHeightMin: { value: ht.min },
      uHeightRange: { value: ht.range },
      uWorldMin: { value: new THREE.Vector2(ht.worldMin, ht.worldMin) },
      uWorldSize: { value: ht.worldSize },
      uWaterLevel: { value: waterLevel },
      uShallowDepth: { value: preset.shallowDepth },
      uFoamTex: { value: foamTex },
      uFoam: { value: preset.foam },
      uFoamWidth: { value: preset.foamWidth },
      uWaveAmp: { value: preset.waveAmp },
      uMurk: { value: preset.murk },
    },
  });
  waterMaterials.push(mat);
  return mat;
}
