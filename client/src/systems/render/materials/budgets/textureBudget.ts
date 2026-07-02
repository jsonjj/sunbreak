// Texture-memory budget: per-tier caps + a runtime VRAM estimator with a high-water log.
// KTX2 stays block-compressed in VRAM (PNG/JPG decode to full RGBA and blow the budget), so we
// estimate from each texture's dimensions + format rather than trusting file size.
import type * as THREE from "three";
import type { QualityTier } from "../types";

export interface TierCaps {
  maxRes: number;
  anisotropy: number;
  vramBudgetMB: number;
}

export const TEXTURE_TIERS: Record<QualityTier, TierCaps> = {
  low: { maxRes: 512, anisotropy: 2, vramBudgetMB: 256 },
  medium: { maxRes: 1024, anisotropy: 4, vramBudgetMB: 512 },
  high: { maxRes: 2048, anisotropy: 8, vramBudgetMB: 1024 },
};

// Live set of textures this subsystem created — the basis of the VRAM estimate.
const tracked = new Set<THREE.Texture>();
let highWaterMB = 0;

export function trackTexture(tex: THREE.Texture): void {
  tracked.add(tex);
}

export function untrackTexture(tex: THREE.Texture): void {
  tracked.delete(tex);
}

/** Re-apply anisotropy to all live textures (called when the quality tier changes). */
export function applyAnisotropyToTracked(anisotropy: number): void {
  for (const t of tracked) {
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
  }
}

function bytesPerPixel(tex: THREE.Texture): number {
  // Compressed (KTX2) textures carry mip levels with byteLength; use them directly when present.
  const mips = (tex as THREE.CompressedTexture).mipmaps;
  if (Array.isArray(mips) && mips.length > 0) {
    let bytes = 0;
    for (const m of mips) bytes += (m as { data?: ArrayBufferView }).data?.byteLength ?? 0;
    const img = tex.image as { width?: number; height?: number } | undefined;
    const w = img?.width ?? 1;
    const h = img?.height ?? 1;
    return bytes / Math.max(1, w * h);
  }
  // Uncompressed: assume RGBA8 (4 bytes/px). This is the case we most want to discourage.
  return 4;
}

function textureBytes(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  if (!w || !h) return 0;
  const base = w * h * bytesPerPixel(tex);
  return tex.generateMipmaps ? base * 1.333 : base; // +~1/3 for the mip chain
}

/**
 * Estimate total texture VRAM (MB) for materials this subsystem owns. Pass the renderer to also
 * surface three's live texture count for cross-checking. Updates + logs a high-water mark.
 */
export function estimateTextureVRAM(renderer?: THREE.WebGLRenderer): {
  estimatedMB: number;
  trackedCount: number;
  rendererTextureCount?: number;
} {
  let bytes = 0;
  for (const t of tracked) bytes += textureBytes(t);
  const estimatedMB = bytes / (1024 * 1024);
  if (estimatedMB > highWaterMB) {
    highWaterMB = estimatedMB;
    // eslint-disable-next-line no-console
    console.info(`[materials] texture VRAM high-water: ${highWaterMB.toFixed(1)} MB (${tracked.size} textures)`);
  }
  return {
    estimatedMB,
    trackedCount: tracked.size,
    rendererTextureCount: renderer?.info.memory.textures,
  };
}

/** Budget snapshot vs the current tier's cap. */
export function getTextureBudget(tier: QualityTier, renderer?: THREE.WebGLRenderer) {
  const caps = TEXTURE_TIERS[tier];
  const { estimatedMB, trackedCount, rendererTextureCount } = estimateTextureVRAM(renderer);
  return {
    tier,
    capMB: caps.vramBudgetMB,
    estimatedMB,
    highWaterMB,
    overBudget: estimatedMB > caps.vramBudgetMB,
    trackedCount,
    rendererTextureCount,
  };
}
