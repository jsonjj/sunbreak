// CC0 asset assumptions + license hygiene, per the asset catalog.
//
// The plan (see character-content.md): download Quaternius CC0 bases/outfits/anims + optional
// Mixamo clips, conform every rig to `mixamorig:*`, Draco/meshopt-compress, and VENDOR the
// resulting GLBs into this folder (imported via `?url`). We commit ONLY conformed/compressed GLBs
// actually used by the game — never raw Mixamo files (those are non-redistributable).
//
// Until those GLBs are vendored, TEMPLATE_URLS / CLIP_URLS stay empty and the subsystem runs on the
// procedural rig + procedural clip library — the whole pipeline (clone, tint, animate, switch)
// works FOR REAL today, and swaps to the CC0 GLBs the moment they're dropped in.

import type * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { BodyId } from "../types";
import { registerExternalClips } from "./animationLibrary";
import { assertBoneParity } from "./skeleton";
import { registerExternalTemplate } from "./templates";

export interface AssetSource {
  name: string;
  author: string;
  license: "CC0" | "Free (royalty-free)";
  url: string;
  role: string;
}

/** License attribution for every intended CC0 source. Mirror this into assets/ATTRIBUTION.md when
 *  GLBs are vendored (that path is outside this subsystem's folder — integrator/asset-catalog owns it). */
export const ATTRIBUTION: readonly AssetSource[] = [
  {
    name: "Universal Base Characters (6 bodies, 20 hairs)",
    author: "Quaternius",
    license: "CC0",
    url: "https://quaternius.com/",
    role: "Ped base bodies on a Mixamo-compatible rig",
  },
  {
    name: "Modular Character Outfits (62 parts, 3 colors each)",
    author: "Quaternius",
    license: "CC0",
    url: "https://quaternius.com/",
    role: "Wardrobe swap parts + texture variants",
  },
  {
    name: "Universal Animation Library 1 + 2 (250+ clips)",
    author: "Quaternius",
    license: "CC0",
    url: "https://quaternius.itch.io/",
    role: "Locomotion / combat / emote clips",
  },
  {
    name: "Auto-rigger + clip library",
    author: "Adobe Mixamo",
    license: "Free (royalty-free)",
    url: "https://www.mixamo.com/",
    role: "Conform other CC0 humanoids to mixamorig:*; supplement clips (raw files not redistributed)",
  },
];

/** Conformed rig-template GLBs per body proportion. Colocate as `./assets/<file>.glb` + `?url`. */
export const TEMPLATE_URLS: Partial<Record<BodyId, string>> = {
  // medium: new URL("./assets/body-medium.glb", import.meta.url).href,
};

/** Merged clip GLBs (e.g. locomotion.glb, actions.glb). */
export const CLIP_URLS: readonly string[] = [
  // new URL("./assets/locomotion.glb", import.meta.url).href,
  // new URL("./assets/actions.glb", import.meta.url).href,
];

let loader: GLTFLoader | null = null;

/** Load a GLB/GLTF. (Draco/meshopt decoders can be attached here when vendored assets need them.) */
export async function loadGltf(url: string): Promise<GLTF> {
  loader ??= new GLTFLoader();
  return loader.loadAsync(url);
}

let preloadStarted = false;

/**
 * Best-effort async preload of vendored CC0 GLBs. Non-blocking: if nothing is configured (or a load
 * fails), the procedural rig/clips remain in use. Safe to call from module init().
 */
export async function preloadCharacterAssets(): Promise<void> {
  if (preloadStarted) return;
  preloadStarted = true;

  const templateEntries = Object.entries(TEMPLATE_URLS) as Array<[BodyId, string]>;
  if (templateEntries.length === 0 && CLIP_URLS.length === 0) {
    if (import.meta.env?.DEV) {
      console.info("[character-content] no vendored CC0 GLBs yet — using procedural rig + clips");
    }
    return;
  }

  try {
    for (const [bodyId, url] of templateEntries) {
      const gltf = await loadGltf(url);
      assertBoneParity(gltf.scene);
      registerExternalTemplate(bodyId, gltf.scene);
    }
    const clips: THREE.AnimationClip[] = [];
    for (const url of CLIP_URLS) {
      const gltf = await loadGltf(url);
      clips.push(...gltf.animations);
    }
    if (clips.length > 0) registerExternalClips(clips);
    if (import.meta.env?.DEV) {
      console.info("[character-content] vendored CC0 assets loaded");
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn("[character-content] CC0 asset preload failed; procedural fallback in use", err);
    }
  }
}
