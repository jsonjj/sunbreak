// Art-direction curves: how colors/intensities/sky params move across the day/night cycle.
// Color helpers mutate a caller-provided scratch `Color` (no per-frame allocation). Scalar
// helpers just return numbers. Tuned for the v0 renderer's ACES filmic tone mapping.
import { Color, MathUtils } from "three";
import type { Sky } from "three/addons/objects/Sky.js";

const { lerp, smoothstep, clamp } = MathUtils;

// Keyframe palette (constructed once).
const SUN_LOW = new Color("#ff7a2f"); // warm dawn/dusk sun
const SUN_HIGH = new Color("#fff3e0"); // near-white midday sun
const MOON = new Color("#8fb4ff"); // cool moonlight
const SKY_DAY = new Color("#bcd6ff");
const SKY_NIGHT = new Color("#0a1024");
const GND_DAY = new Color("#6b6152");
const GND_NIGHT = new Color("#05070d");
const FOG_DAY = new Color("#c3d6e6");
const FOG_NIGHT = new Color("#070c1c");

/** Key-light (sun or moon) color for the given elevation. Writes into `out`. */
export function keyLightColor(out: Color, elevation: number, isMoon: boolean): Color {
  if (isMoon) return out.copy(MOON);
  const t = smoothstep(elevation, 0.02, 0.35);
  return out.copy(SUN_LOW).lerp(SUN_HIGH, t);
}

/** Key-light intensity. Fades to ~0 at the horizon so dawn/dusk read as a lull. */
export function keyIntensity(elevation: number, isMoon: boolean): number {
  const base = smoothstep(elevation, 0.0, 0.28);
  return isMoon ? 0.35 * base : 3.1 * base;
}

export function hemiSkyColor(out: Color, dayAmount: number): Color {
  return out.copy(SKY_NIGHT).lerp(SKY_DAY, dayAmount);
}

export function hemiGroundColor(out: Color, dayAmount: number): Color {
  return out.copy(GND_NIGHT).lerp(GND_DAY, dayAmount);
}

export function hemiIntensity(dayAmount: number): number {
  return lerp(0.18, 0.7, dayAmount);
}

export function ambientIntensity(dayAmount: number): number {
  return lerp(0.05, 0.3, dayAmount);
}

export function fogColor(out: Color, dayAmount: number): Color {
  return out.copy(FOG_NIGHT).lerp(FOG_DAY, dayAmount);
}

/** IBL strength: dim ambient bounce at night, full at midday. */
export function envIntensity(dayAmount: number): number {
  return lerp(0.12, 1.0, dayAmount);
}

/** Star opacity: invisible by day, full at night. */
export function starOpacity(dayAmount: number): number {
  return clamp(1 - dayAmount * 1.15, 0, 1);
}

/**
 * Push the Preetham `Sky` shader uniforms for the given day amount + sun direction. Shared by
 * the visible sky dome and the IBL capture sky so the environment matches what you see.
 */
export function applySkyUniforms(
  sky: Sky,
  dayAmount: number,
  sunDir: { x: number; y: number; z: number },
): void {
  // Sky's SkyShader always defines these uniforms (see three/addons/objects/Sky.js).
  const u = sky.material.uniforms;
  u.turbidity!.value = lerp(2.0, 8.0, dayAmount);
  u.rayleigh!.value = lerp(0.5, 2.2, dayAmount);
  u.mieCoefficient!.value = lerp(0.004, 0.006, dayAmount);
  u.mieDirectionalG!.value = 0.8;
  u.sunPosition!.value.set(sunDir.x, sunDir.y, sunDir.z);
}
