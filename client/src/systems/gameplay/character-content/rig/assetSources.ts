// CC0 asset assumptions + license hygiene, per the asset catalog, PLUS an opt-in loader for a real
// rigged humanoid GLB.
//
// TWO WAYS TO GET A REAL RIGGED HUMANOID IN:
//
// 1. VENDORED (colocated, committed) — the production path. Drop a *conformed* GLB next to this file
//    under `./assets/…` and reference it via `new URL("./assets/x.glb", import.meta.url)` in
//    TEMPLATE_URLS / CLIP_URLS below. "Conformed" = its skeleton uses the sanitized `mixamorig*`
//    bone names (assertBoneParity checks this) and its clips are in-place. Commit ONLY
//    conformed/compressed GLBs actually used — never raw Mixamo files (non-redistributable).
//
// 2. PUBLIC FILE (opt-in, not committed) — the quick way to SEE a real humanoid. Put a rigged GLB at
//    `client/public/assets/characters/<file>.glb` and enable it at runtime (see REAL_HUMANOID +
//    realHumanoidEnabled). Off by default so the game ships on the free procedural human. This repo
//    ships fetched `Soldier.glb` (three.js example, a Mixamo/Adobe royalty-free rig with real
//    Idle/Walk/Run mocap) wired here — enable with `?realrig=1` on the URL.
//
// Until a real asset is active, the subsystem runs on the procedural rig + procedural clip library —
// the whole pipeline (clone, tint, animate, switch) works FOR REAL today and swaps the instant an
// asset lands.

import * as THREE from "three";
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
  {
    name: "Soldier.glb (Vanguard) + Idle/Walk/Run clips",
    author: "Adobe Mixamo, via the three.js examples",
    license: "Free (royalty-free)",
    url: "https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf",
    role: "Opt-in real rigged humanoid demo (mixamorig rig + real locomotion mocap)",
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

/**
 * Opt-in real humanoid served from `client/public/`. Its clips are named Idle/Walk/Run — which line
 * up with the shared library's AnimState names, so they override the procedural locomotion clips by
 * name. `targetHeight` (m) rescales the loaded rig to match the player capsule; feet are re-centered
 * to the origin at load. Swap `url` to any rigged, mixamorig-named GLB (e.g. a Ready Player Me
 * avatar re-exported through Mixamo) to change the character.
 */
const REAL_HUMANOID = {
  url: "/assets/characters/Soldier.glb",
  targetHeight: 1.85,
} as const;

/** Enable the opt-in real humanoid: `?realrig=1` (or `=0` to force off), or localStorage, or env. */
function realHumanoidEnabled(): boolean {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (env?.VITE_REAL_HUMANOID === "1") return true;
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("realrig");
      if (param !== null) return param !== "0";
      if (window.localStorage?.getItem("sunbreak:realrig") === "1") return true;
    }
  } catch {
    /* SSR / no window — fall through to disabled */
  }
  return false;
}

let loader: GLTFLoader | null = null;

/** Load a GLB/GLTF. (Draco/meshopt decoders can be attached here when vendored assets need them.) */
export async function loadGltf(url: string): Promise<GLTF> {
  loader ??= new GLTFLoader();
  return loader.loadAsync(url);
}

const BODY_IDS: readonly BodyId[] = ["medium", "slim", "heavy"];

/**
 * Load the opt-in public humanoid: normalize it to feet-at-origin + target height, register it as
 * the template for every body proportion, and publish its real locomotion clips (Idle/Walk/Run,
 * plus a Sprint aliased from Run) into BOTH clip systems. Returns true on success.
 */
async function loadRealHumanoid(): Promise<boolean> {
  const gltf = await loadGltf(REAL_HUMANOID.url);
  const inner = gltf.scene;
  inner.updateMatrixWorld(true);

  // Normalize scale (to target height) + origin (feet on the ground), independent of the source's
  // native units/pivot — the drive system then only applies the capsule→feet yOffset.
  const box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = size.y > 1e-3 ? REAL_HUMANOID.targetHeight / size.y : 1;

  const root = new THREE.Group();
  root.name = "char:real-humanoid";
  inner.scale.multiplyScalar(scale);
  inner.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
  root.add(inner);
  root.updateMatrixWorld(true);

  assertBoneParity(root);
  for (const bodyId of BODY_IDS) registerExternalTemplate(bodyId, root);

  // Real clips (already sanitized by GLTFLoader). Add a Sprint aliased from Run if none shipped.
  const clips: THREE.AnimationClip[] = [...gltf.animations];
  const run = clips.find((c) => /run/i.test(c.name));
  if (run && !clips.some((c) => /sprint/i.test(c.name))) {
    const sprint = run.clone();
    sprint.name = "Sprint";
    clips.push(sprint);
  }
  registerExternalClips(clips); // live path: character-content Animator (getClips)
  return true;
}

let preloadStarted = false;

/**
 * Best-effort async preload of vendored CC0 GLBs and/or the opt-in public humanoid. Non-blocking: if
 * nothing is configured (or a load fails), the procedural rig/clips remain in use. Safe to call from
 * module init(). NOTE: characters built before this resolves keep the procedural rig — the public
 * humanoid load is local and fast, but for guaranteed application prefer the vendored path.
 */
export async function preloadCharacterAssets(): Promise<void> {
  if (preloadStarted) return;
  preloadStarted = true;

  const useRealHumanoid = realHumanoidEnabled();
  const templateEntries = Object.entries(TEMPLATE_URLS) as Array<[BodyId, string]>;
  if (!useRealHumanoid && templateEntries.length === 0 && CLIP_URLS.length === 0) {
    if (import.meta.env?.DEV) {
      console.info("[character-content] no vendored/real GLBs active — using procedural rig + clips");
    }
    return;
  }

  try {
    if (useRealHumanoid) {
      await loadRealHumanoid();
      if (import.meta.env?.DEV) {
        console.info(`[character-content] real humanoid active (${REAL_HUMANOID.url})`);
      }
    }
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
    if (import.meta.env?.DEV && templateEntries.length > 0) {
      console.info("[character-content] vendored CC0 assets loaded");
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn("[character-content] asset preload failed; procedural fallback in use", err);
    }
  }
}
