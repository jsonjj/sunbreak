// Read-only adapter over the v0 render-quality store (the shared quality contract). We consume
// it here rather than duplicating a tier system, so the Settings UI stays the single source of
// truth. Non-reactive access (`getState`) is fine because the render-phase system re-reads it
// every frame.
import { useQuality } from "@/render/quality/useQuality";

export interface LightingCaps {
  /** Directional shadow map resolution (px). */
  shadowMapSize: number;
  /** Whether the sun should cast shadows at all (off on the Low tier). */
  shadowsEnabled: boolean;
  /** Base fog density; lighting scales it by time of day. */
  fogDensity: number;
}

export function lightingCaps(): LightingCaps {
  const s = useQuality.getState().settings;
  return {
    shadowMapSize: s.shadowMap,
    shadowsEnabled: s.shadows !== false,
    fogDensity: s.fogDensity,
  };
}
