// Loads the shared clip library ONCE (module-cached). Procedural clips are the baseline; any clips
// loaded from vendored CC0 GLBs (locomotion.glb / actions.glb) are merged in by name, overriding
// the procedural version of the same state. All bind on any mixamorig rig with zero retargeting.

import type * as THREE from "three";
import { buildLibraryClips } from "./proceduralClips";

let proceduralCache: THREE.AnimationClip[] | null = null;
const external = new Map<string, THREE.AnimationClip>();

/** The full shared clip set (procedural baseline + any external overrides by name). */
export function getClips(): THREE.AnimationClip[] {
  if (!proceduralCache) proceduralCache = buildLibraryClips();
  if (external.size === 0) return proceduralCache;
  const byName = new Map<string, THREE.AnimationClip>();
  for (const c of proceduralCache) byName.set(c.name, c);
  for (const [name, c] of external) byName.set(name, c);
  return [...byName.values()];
}

/** Merge clips loaded from a vendored GLB into the shared library. */
export function registerExternalClips(clips: readonly THREE.AnimationClip[]): void {
  for (const c of clips) external.set(c.name, c);
}

/** Warm the procedural cache (cheap; safe to call at init). */
export function preloadClips(): void {
  getClips();
}
