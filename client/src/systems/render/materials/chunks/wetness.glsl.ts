// Systemic wetness: darken albedo + smooth roughness, with patchy puddles pooling on up-facing
// surfaces. Driven entirely by the global bus (uWetness/uPuddleLevel) + per-material knobs
// (uPorosity/uPuddleFactor). Shared verbatim by env, terrain, vehicle and foliage masters — and
// exported to the Water subsystem for shoreline/puddle continuity.

/** Function defs — append to a master's fragment `common` block. */
export const matWetnessFns = /* glsl */ `
float matHash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float matValueNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = matHash(i);
  float b = matHash(i + vec2(1.0, 0.0));
  float c = matHash(i + vec2(0.0, 1.0));
  float d = matHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float matPuddleMask(vec3 wpos, vec3 wn){
  float up = smoothstep(0.35, 0.9, clamp(wn.y, 0.0, 1.0));          // only near-horizontal pools
  float n = matValueNoise(wpos.xz * 0.18 + uTime * 0.01);           // patchy, gently drifting
  float pooled = smoothstep(1.0 - uPuddleLevel, 1.02, n * 0.7 + 0.32);
  return up * pooled;
}
`;

/**
 * Inject after `#include <color_fragment>`. Declares `matWetAmt`/`matPuddleAmt` (reused later by
 * the roughness hook) and darkens the albedo. Puddles read darker than plain wet.
 */
export const matWetnessAlbedo = /* glsl */ `
  float matWetAmt = clamp(uWetness * uPorosity, 0.0, 1.0);
  float matPuddleAmt = matPuddleMask(vMatWorldPos, vMatWorldNormal) * uPuddleFactor;
  {
    float darken = mix(1.0, 0.6, matWetAmt);
    darken = mix(darken, 0.42, matPuddleAmt);
    diffuseColor.rgb *= darken;
  }
`;

/** Inject after `#include <roughnessmap_fragment>` — smooth when wet, near-mirror in puddles. */
export const matWetnessRoughness = /* glsl */ `
  {
    float wr = mix(roughnessFactor, roughnessFactor * 0.22, matWetAmt);
    roughnessFactor = clamp(mix(wr, 0.04, matPuddleAmt), 0.02, 1.0);
  }
`;
