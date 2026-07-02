// The uniform bus: a small Zustand store of weather/time-of-day INPUTS (set by other subsystems),
// plus `updateUniformBus(dt)` which each frame derives sun direction, night factor, systemic
// wetness and puddles, and writes them into the shared `globalUniforms` bag.
//
// SUNBREAK has no weather/time-of-day store yet (gameplay/daynight is a stub), so this subsystem
// owns the source of truth. gameplay/daynight (or a weather sim) drives it via the setter API
// below — e.g. `setTimeOfDay(t)` / `setWeather({ rain })`. React look-dev can subscribe to the store.
import * as THREE from "three";
import { create } from "zustand";
import { globalUniforms } from "./globalUniforms";

export interface WeatherInput {
  timeOfDay: number; // 0..1
  rain: number; // 0..1
  windDir: number; // radians
  windStrength: number; // 0..1
  /** When non-null, forces wetness (e.g. after a car wash / scripted scene); else rain drives it. */
  wetnessOverride: number | null;
}

export interface EnvStore extends WeatherInput {
  setTimeOfDay: (t: number) => void;
  setRain: (r: number) => void;
  setWind: (dir: number, strength: number) => void;
  setWetness: (w: number | null) => void;
  setWeather: (p: Partial<WeatherInput>) => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const useEnvStore = create<EnvStore>((set) => ({
  timeOfDay: 0.5,
  rain: 0,
  windDir: 0.7,
  windStrength: 0.12,
  wetnessOverride: null,
  setTimeOfDay: (t) => set({ timeOfDay: ((t % 1) + 1) % 1 }),
  setRain: (r) => set({ rain: clamp01(r) }),
  setWind: (windDir, windStrength) => set({ windDir, windStrength: clamp01(windStrength) }),
  setWetness: (w) => set({ wetnessOverride: w == null ? null : clamp01(w) }),
  setWeather: (p) => set(p),
}));

// ── Standalone setters for non-React callers (ECS systems, plain modules) ───────────────────────
export const setTimeOfDay = (t: number) => useEnvStore.getState().setTimeOfDay(t);
export const setRain = (r: number) => useEnvStore.getState().setRain(r);
export const setWind = (dir: number, strength: number) => useEnvStore.getState().setWind(dir, strength);
export const setWetness = (w: number | null) => useEnvStore.getState().setWetness(w);
export const setWeather = (p: Partial<WeatherInput>) => useEnvStore.getState().setWeather(p);

// ── Per-frame integrator ────────────────────────────────────────────────────────────────────────
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Framerate-independent exponential approach of `cur` toward `target` at rate `k`. */
const approach = (cur: number, target: number, k: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt * k));

const _sunColorDay = new THREE.Color(1, 0.98, 0.92);
const _sunColorHorizon = new THREE.Color(1, 0.55, 0.28);

/** Push weather/time-of-day inputs → derived GPU uniforms. Call once per frame. */
export function updateUniformBus(dt: number): void {
  const s = useEnvStore.getState();
  const gu = globalUniforms;

  gu.uTime.value += dt;
  gu.uTimeOfDay.value = s.timeOfDay;

  // Analytic sun: elevation peaks at noon (0.5), dips below horizon at night.
  const elevation = Math.sin((s.timeOfDay - 0.25) * Math.PI * 2); // -1..1
  const azimuth = s.timeOfDay * Math.PI * 2;
  const cosEl = Math.cos(Math.asin(Math.max(-1, Math.min(1, elevation))));
  gu.uSunDir.value.set(Math.cos(azimuth) * cosEl, elevation, Math.sin(azimuth) * cosEl).normalize();

  // Night ramps in as the sun drops through the horizon band.
  const night = 1 - smoothstep(-0.05, 0.18, elevation);
  gu.uNightFactor.value = night;

  // Sun color: warm near the horizon, dim at night.
  const horizonMix = 1 - smoothstep(0.0, 0.35, Math.abs(elevation));
  gu.uSunColor.value.copy(_sunColorDay).lerp(_sunColorHorizon, horizonMix).multiplyScalar(0.15 + 0.85 * (1 - night));

  // Systemic wetness: wets fast, dries slow. Puddles accumulate/drain slower still.
  const target = s.wetnessOverride != null ? s.wetnessOverride : s.rain;
  const wettingRate = target > gu.uWetness.value ? 0.8 : 0.15;
  gu.uWetness.value = approach(gu.uWetness.value, target, wettingRate, dt);
  gu.uRainIntensity.value = approach(gu.uRainIntensity.value, s.rain, 3.0, dt);

  const puddleTarget = gu.uWetness.value > 0.55 ? (gu.uWetness.value - 0.55) / 0.45 : 0;
  gu.uPuddleLevel.value = approach(gu.uPuddleLevel.value, puddleTarget, puddleTarget > gu.uPuddleLevel.value ? 0.08 : 0.05, dt);

  gu.uWind.value.set(Math.cos(s.windDir), Math.sin(s.windDir)).multiplyScalar(s.windStrength);
}
