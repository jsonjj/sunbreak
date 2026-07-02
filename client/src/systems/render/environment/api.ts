// Public API + runtime store for the environment subsystem. Other subsystems integrate through
// this (and through the `env_*` ECS components) — never by importing internal build files:
//   • physics  → getHeightfield() / heightfieldRows() + getStaticColliders()
//   • player/vehicles/audio → sampleHeight() / surfaceAt() (grounding, wheels, footstep tags)
//   • rendering-core/quality → setTier() to drive Low/Med/High + auto-scaling

import { create } from "zustand";
import { WATER_LEVEL, ENV_TIERS, type QualityTier, type EnvQualitySettings } from "./constants";
import {
  sampleHeight,
  surfaceAt,
  sampleNormal,
  sampleSlope,
  buildHeightfield,
  heightfieldRows,
  type EnvHeightfield,
  type SurfaceSample,
} from "./heightfield";
import type { EnvColliderDesc } from "./props";

interface EnvState {
  tier: QualityTier;
  autoQuality: boolean;
  ready: boolean;
  colliders: EnvColliderDesc[];
  /** Set the base quality tier (rebuild happens on next build; live tweaks are adaptive). */
  setTier: (tier: QualityTier) => void;
  setAuto: (autoQuality: boolean) => void;
  /** @internal populated by the build orchestrator */
  _setReady: (ready: boolean) => void;
  /** @internal */
  _setColliders: (colliders: EnvColliderDesc[]) => void;
}

export const useEnvironment = create<EnvState>()((set) => ({
  tier: "medium",
  autoQuality: true,
  ready: false,
  colliders: [],
  setTier: (tier) => set({ tier }),
  setAuto: (autoQuality) => set({ autoQuality }),
  _setReady: (ready) => set({ ready }),
  _setColliders: (colliders) => set({ colliders }),
}));

/** Stable, dependency-light surface consumed by sibling subsystems. */
export const environmentApi = {
  sampleHeight,
  sampleNormal,
  sampleSlope,
  surfaceAt,
  getWaterLevel: (): number => WATER_LEVEL,
  getHeightfield: (): EnvHeightfield => buildHeightfield(),
  heightfieldRows,
  getStaticColliders: (): EnvColliderDesc[] => useEnvironment.getState().colliders,
  getTier: (): QualityTier => useEnvironment.getState().tier,
  getTierSettings: (): EnvQualitySettings => ENV_TIERS[useEnvironment.getState().tier],
  isReady: (): boolean => useEnvironment.getState().ready,
};

export type EnvironmentApi = typeof environmentApi;

/** Convenience accessor (identical to importing `environmentApi`). */
export function getEnvironmentApi(): EnvironmentApi {
  return environmentApi;
}

export {
  sampleHeight,
  sampleNormal,
  sampleSlope,
  surfaceAt,
  buildHeightfield,
  heightfieldRows,
  WATER_LEVEL,
};
export type { EnvHeightfield, SurfaceSample, EnvColliderDesc, QualityTier };
