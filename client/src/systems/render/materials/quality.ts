// Local quality-tier state for texture caps + anisotropy. Owned here so the subsystem is
// self-contained and testable; the integrator wires the app's tier (useQuality / useSettingsStore)
// into `setQualityTier`. Re-exports the tier cap table from budgets for a single source of truth.
import type { QualityTier } from "./types";
import { TEXTURE_TIERS, applyAnisotropyToTracked, type TierCaps } from "./budgets/textureBudget";

export { TEXTURE_TIERS } from "./budgets/textureBudget";
export type { TierCaps } from "./budgets/textureBudget";

let currentTier: QualityTier = "high";
const listeners = new Set<(tier: QualityTier) => void>();

export function getQualityTier(): QualityTier {
  return currentTier;
}

export function getTierCaps(): TierCaps {
  return TEXTURE_TIERS[currentTier];
}

/** Set the active tier. Updates anisotropy on already-loaded textures and notifies subscribers. */
export function setQualityTier(tier: QualityTier): void {
  if (tier === currentTier) return;
  currentTier = tier;
  applyAnisotropyToTracked(TEXTURE_TIERS[tier].anisotropy);
  for (const fn of listeners) fn(tier);
}

/** Subscribe to tier changes (e.g. to re-pick KTX2 resolution variants). Returns an unsubscribe. */
export function onQualityTierChange(fn: (tier: QualityTier) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
