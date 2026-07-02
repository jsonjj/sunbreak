// Consumer-facing React/R3F hooks.
//
//  • Reactive (HUD, DOM): useClock / useWeather / useForecast / useIsNight /
//    useDayPart / useEnvHud — coarse, re-render only on change.
//  • Transient (R3F, per-frame, NO re-render): useEnvRef / useEffectsRef /
//    useSunPosition — update a ref inside useFrame from the live singleton.
//
// R3F transient hooks MUST be used inside the <Canvas> tree (they call useFrame).

import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEnvStore } from "./store";
import type { EnvHudState } from "./store";
import { getEffects, getEnv } from "./singleton";
import type { EnvEffects, EnvSnapshot } from "./types";

// --- reactive coarse selectors (safe outside Canvas; for the HUD) ---
export function useClock(): string {
  return useEnvStore((s) => s.clock);
}
export function useWeather(): EnvHudState["weather"] {
  return useEnvStore((s) => s.weather);
}
export function useForecast(): EnvHudState["nextWeather"] {
  return useEnvStore((s) => s.nextWeather);
}
export function useIsNight(): boolean {
  return useEnvStore((s) => s.isNight);
}
export function useDayPart(): EnvHudState["dayPart"] {
  return useEnvStore((s) => s.dayPart);
}
/** Escape hatch for custom coarse selectors. */
export function useEnvHud<T>(selector: (s: EnvHudState) => T): T {
  return useEnvStore(selector);
}

// --- transient per-frame refs (inside Canvas; no re-render) ---
/** A ref whose `.current` is refreshed every frame from the live snapshot. */
export function useEnvRef<T>(selector: (e: EnvSnapshot) => T, initial: T): RefObject<T> {
  const ref = useRef<T>(initial);
  useFrame(() => {
    ref.current = selector(getEnv());
  });
  return ref;
}

/** A ref whose `.current` is refreshed every frame from the live derived effects. */
export function useEffectsRef<T>(selector: (e: EnvEffects) => T, initial: T): RefObject<T> {
  const ref = useRef<T>(initial);
  useFrame(() => {
    ref.current = selector(getEffects());
  });
  return ref;
}

/** A stable THREE.Vector3 (position TO the sun) updated every frame — feed drei <Sky>/lights. */
export function useSunPosition(distance = 1): RefObject<THREE.Vector3> {
  const v = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  useFrame(() => {
    const s = getEnv().sun;
    v.current.set(s.x, s.y, s.z).multiplyScalar(distance);
  });
  return v;
}

// Live, non-hook accessors re-exported for consumers that already run their own useFrame.
export { getEnv, getEffects } from "./singleton";
