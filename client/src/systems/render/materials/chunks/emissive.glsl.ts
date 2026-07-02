// Day/night neon ramp. Emissive is dim by day and comes alive at night; per-material uEmissiveBoost
// pushes hero signage above luminance 1.0 so the Post-processing subsystem's Bloom picks it up
// (this is the shared "emissive > 1.0 blooms" convention).

/** Inject after `#include <emissivemap_fragment>` (operates on three's `totalEmissiveRadiance`). */
export const matNightEmissive = /* glsl */ `
  {
    float ramp = mix(0.12, 1.0, clamp(uNightFactor, 0.0, 1.0));
    totalEmissiveRadiance *= ramp * uEmissiveBoost;
  }
`;
