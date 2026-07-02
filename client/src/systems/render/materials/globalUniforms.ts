// The single shared uniform bus. ONE object, updated once per frame by `updateUniformBus`.
// Every master material assigns these SAME `THREE.Uniform` references into its compiled shader,
// so mutating `globalUniforms.uWetness.value` instantly drives thousands of meshes for free —
// no per-material JS loop, no recompiles (values only, never `#define`s at runtime).
import * as THREE from "three";

export const globalUniforms = {
  /** Seconds since start — animated effects (puddle noise drift, neon flicker, wind). */
  uTime: new THREE.Uniform(0),
  /** 0..1 time-of-day (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset). */
  uTimeOfDay: new THREE.Uniform(0.5),
  /** Normalized sun direction (world space), derived from time-of-day. */
  uSunDir: new THREE.Uniform(new THREE.Vector3(0.3, 0.9, 0.2).normalize()),
  /** Sun/key light color — warms at the horizon, dims at night. */
  uSunColor: new THREE.Uniform(new THREE.Color(1, 0.98, 0.92)),
  /** 0 dry → 1 soaked. Systemic: eased toward rain/override with wetting > drying inertia. */
  uWetness: new THREE.Uniform(0),
  /** 0..1 instantaneous rain intensity. */
  uRainIntensity: new THREE.Uniform(0),
  /** 0..1 accumulated standing water (puddles form/drain slowly under sustained wetness). */
  uPuddleLevel: new THREE.Uniform(0),
  /** 0 day → 1 night. Drives the neon emissive ramp. */
  uNightFactor: new THREE.Uniform(0),
  /** Wind vector (xz), magnitude = strength. Drives foliage/cloth sway. */
  uWind: new THREE.Uniform(new THREE.Vector2(0, 0)),
} as const;

export type GlobalUniforms = typeof globalUniforms;
