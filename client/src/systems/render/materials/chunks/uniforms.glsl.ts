// Shared GLSL declarations injected into every master (fragment + vertex), plus the
// instancing-aware world-space capture used by wetness/puddle masking.
//
// Authored as small, isolated GLSL strings so they can be re-expressed as TSL node functions
// during an optional v5 WebGPU migration (where onBeforeCompile/ShaderMaterial don't exist).

/** Declared once after `#include <common>` in the FRAGMENT stage. */
export const matUniformDeclFrag = /* glsl */ `
uniform float uTime;
uniform float uTimeOfDay;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uWetness;
uniform float uRainIntensity;
uniform float uPuddleLevel;
uniform float uNightFactor;
uniform vec2  uWind;
uniform float uPuddleFactor;
uniform float uPorosity;
uniform float uEmissiveBoost;
varying vec3 vMatWorldPos;
varying vec3 vMatWorldNormal;
`;

/** Declared once after `#include <common>` in the VERTEX stage. */
export const matUniformDeclVert = /* glsl */ `
uniform float uTime;
uniform vec2  uWind;
varying vec3 vMatWorldPos;
varying vec3 vMatWorldNormal;
`;

/**
 * Written right after `#include <begin_vertex>` (so `transformed` + `objectNormal` exist, and any
 * wind displacement has already been applied to `transformed`). Instancing-aware so puddle masks
 * line up on InstancedMesh props.
 */
export const matWorldCaptureVert = /* glsl */ `
  #ifdef USE_INSTANCING
    mat4 matModel = modelMatrix * instanceMatrix;
  #else
    mat4 matModel = modelMatrix;
  #endif
  vMatWorldPos = (matModel * vec4(transformed, 1.0)).xyz;
  vMatWorldNormal = normalize(mat3(matModel) * objectNormal);
`;
