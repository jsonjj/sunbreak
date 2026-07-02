// Loader-helper wrapper: the ONE place other subsystems touch to turn a logical key into a
// renderable/playable resource. It NEVER hits the network while `useRealAssets` is false — it
// hands out cached procedural placeholders so the game runs today. When the real files land under
// /public/assets, flip `configureAssetCatalog({ useRealAssets: true })` and each call transparently
// upgrades, falling back to the placeholder on any per-asset failure.

import * as THREE from "three";
import type { CharacterId, PedArchetype, VehicleId, WeaponId } from "@sunbreak/shared";
import {
  ASSET_CATALOG,
  CHARACTER_ASSET_KEYS,
  PED_ASSET_KEYS,
  VEHICLE_ASSET_KEYS,
  VEHICLE_WHEEL_KEY,
  WEAPON_ASSET_KEYS,
} from "./catalog";
import type { AssetKey } from "./catalog";
import type { AssetCatalogConfig, AssetCategory, AssetEntry, AssetKind } from "./types";
import {
  createPlaceholderAudioDataUrl,
  createPlaceholderEnvironment,
  createPlaceholderMaterial,
  createPlaceholderModel,
  createPlaceholderTexture,
} from "./placeholders";

const DEV = import.meta.env.DEV;
function devWarn(msg: string, err?: unknown): void {
  if (!DEV) return;
  if (err !== undefined) console.warn(`[asset-catalog] ${msg}`, err);
  else console.warn(`[asset-catalog] ${msg}`);
}

// ── Config ─────────────────────────────────────────────────────────────────────────────────

const config: AssetCatalogConfig = {
  basePath: "/assets", // served from client/public/assets (see spec's two-tier layout)
  useRealAssets: false, // no real binaries this wave → placeholders only
};

/** Patch runtime config (base path/CDN, real-asset toggle, Draco decoder path). */
export function configureAssetCatalog(patch: Partial<AssetCatalogConfig>): void {
  Object.assign(config, patch);
}

/** Read the current (frozen) config. */
export function getAssetCatalogConfig(): Readonly<AssetCatalogConfig> {
  return { ...config };
}

// ── Resolution (key → entry / url) ───────────────────────────────────────────────────────────

/** Typed lookup — `key` is constrained to real catalog keys, so this never returns undefined. */
export function getAsset(key: AssetKey): AssetEntry {
  return ASSET_CATALOG[key];
}

/** Loose lookup for dynamic/user-supplied strings. */
export function tryGetAsset(key: string): AssetEntry | undefined {
  return (ASSET_CATALOG as Record<string, AssetEntry>)[key];
}

/** True if `key` names a real catalog entry. */
export function isAssetKey(key: string): key is AssetKey {
  return Object.prototype.hasOwnProperty.call(ASSET_CATALOG, key);
}

function joinUrl(base: string, rel: string): string {
  if (!rel) return "";
  if (/^https?:\/\//.test(rel) || rel.startsWith("/")) return rel;
  return `${base.replace(/\/+$/, "")}/${rel.replace(/^\/+/, "")}`;
}

/** The public URL where the real file lives (once fetched). Empty string if the entry has no file. */
export function getAssetUrl(key: AssetKey): string {
  return joinUrl(config.basePath, getAsset(key).path);
}

// ── Enum → key resolvers (thin, typed) ───────────────────────────────────────────────────────

export function characterAssetKey(id: CharacterId): AssetKey {
  return CHARACTER_ASSET_KEYS[id];
}
export function pedAssetKey(archetype: PedArchetype): AssetKey {
  return PED_ASSET_KEYS[archetype];
}
export function vehicleAssetKey(id: VehicleId): AssetKey {
  return VEHICLE_ASSET_KEYS[id];
}
export function weaponAssetKey(id: WeaponId): AssetKey {
  return WEAPON_ASSET_KEYS[id];
}
/** The shared wheel mesh used by the Rapier raycast vehicle. */
export function vehicleWheelAssetKey(): AssetKey {
  return VEHICLE_WHEEL_KEY;
}

// ── Query helpers (for kits/streaming/credits UIs) ───────────────────────────────────────────

export function listAssetKeys(): AssetKey[] {
  return Object.keys(ASSET_CATALOG) as AssetKey[];
}
export function getAssetsByKind(kind: AssetKind): AssetEntry[] {
  return Object.values(ASSET_CATALOG).filter((e) => e.kind === kind);
}
export function getAssetsByCategory(category: AssetCategory): AssetEntry[] {
  return Object.values(ASSET_CATALOG).filter((e) => e.category === category);
}

// ── Placeholder cache (sync, never networked) ────────────────────────────────────────────────

const modelTemplates = new Map<AssetKey, THREE.Object3D>();
const textureCache = new Map<AssetKey, THREE.Texture>();
const materialCache = new Map<AssetKey, THREE.MeshStandardMaterial>();
const envCache = new Map<AssetKey, THREE.Texture>();
const audioUrlCache = new Map<AssetKey, string>();
const loadedModelTemplates = new Map<AssetKey, THREE.Object3D>();

let missingTexture: THREE.Texture | null = null;
function getMissingTexture(): THREE.Texture {
  if (!missingTexture) {
    missingTexture = createPlaceholderTexture({ pattern: "checker", color: 0x222222 });
  }
  return missingTexture;
}

/**
 * A procedural stand-in Object3D for the key (a fresh clone each call, so callers can transform it
 * independently). Works for any `model`-kind entry (characters, vehicles, props, roads, …).
 */
export function getPlaceholderModel(key: AssetKey): THREE.Object3D {
  const entry = getAsset(key);
  if (entry.kind !== "model") {
    devWarn(`getPlaceholderModel("${key}") is not a model (kind=${entry.kind})`);
    return new THREE.Group();
  }
  let template = modelTemplates.get(key);
  if (!template) {
    template = createPlaceholderModel(entry.placeholder, key);
    modelTemplates.set(key, template);
  }
  return template.clone();
}

/** Cached procedural base-color texture for a `texture`-kind entry. */
export function getPlaceholderTexture(key: AssetKey): THREE.Texture {
  const entry = getAsset(key);
  if (entry.kind !== "texture") {
    devWarn(`getPlaceholderTexture("${key}") is not a texture (kind=${entry.kind})`);
    return getMissingTexture();
  }
  let tex = textureCache.get(key);
  if (!tex) {
    tex = createPlaceholderTexture(entry.placeholder);
    textureCache.set(key, tex);
  }
  return tex;
}

/** Cached MeshStandardMaterial wrapping the placeholder texture (roughness/metalness from spec). */
export function getPlaceholderMaterial(key: AssetKey): THREE.MeshStandardMaterial {
  const entry = getAsset(key);
  if (entry.kind !== "texture") {
    devWarn(`getPlaceholderMaterial("${key}") is not a texture (kind=${entry.kind})`);
    return new THREE.MeshStandardMaterial({ color: 0x808080 });
  }
  let mat = materialCache.get(key);
  if (!mat) {
    mat = createPlaceholderMaterial(entry.placeholder);
    materialCache.set(key, mat);
  }
  return mat;
}

/** Cached equirect environment/sky stand-in for an `hdri`-kind entry (feed drei `<Environment>`). */
export function getPlaceholderEnvironment(key: AssetKey): THREE.Texture {
  const entry = getAsset(key);
  if (entry.kind !== "hdri") {
    devWarn(`getPlaceholderEnvironment("${key}") is not an hdri (kind=${entry.kind})`);
    return getMissingTexture();
  }
  let env = envCache.get(key);
  if (!env) {
    env = createPlaceholderEnvironment(entry.placeholder);
    envCache.set(key, env);
  }
  return env;
}

/**
 * A URL playable by howler/Audio: the real path when `useRealAssets`, else a synthesized WAV data
 * URL so audio wiring works immediately (short tones — swap for real loops later).
 */
export function getAudioUrl(key: AssetKey): string {
  const entry = getAsset(key);
  if (entry.kind !== "audio") {
    devWarn(`getAudioUrl("${key}") is not audio (kind=${entry.kind})`);
    return "";
  }
  if (config.useRealAssets && entry.path) return getAssetUrl(key);
  let url = audioUrlCache.get(key);
  if (url === undefined) {
    url = createPlaceholderAudioDataUrl(entry.placeholder);
    audioUrlCache.set(key, url);
  }
  return url;
}

// ── Async loaders (real file with automatic placeholder fallback) ────────────────────────────

async function loadGltfScene(url: string): Promise<THREE.Object3D> {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  if (config.dracoDecoderPath) {
    const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
    const draco = new DRACOLoader();
    draco.setDecoderPath(config.dracoDecoderPath);
    loader.setDRACOLoader(draco);
  }
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

/**
 * Resolve a model to a real Object3D. With real assets off (or on failure) this returns the
 * procedural placeholder. NOTE: for skinned/animated GLBs prefer drei `useGLTF` + `<Clone>` /
 * SkeletonUtils at the R3F layer; this imperative clone is fine for static props/vehicles.
 */
export async function loadModel(key: AssetKey): Promise<THREE.Object3D> {
  const entry = getAsset(key);
  if (entry.kind !== "model") {
    devWarn(`loadModel("${key}") is not a model (kind=${entry.kind})`);
    return new THREE.Group();
  }
  if (config.useRealAssets && entry.path) {
    const cached = loadedModelTemplates.get(key);
    if (cached) return cached.clone();
    try {
      const scene = await loadGltfScene(getAssetUrl(key));
      loadedModelTemplates.set(key, scene);
      return scene.clone();
    } catch (err) {
      devWarn(`model "${key}" failed to load — using placeholder`, err);
    }
  }
  return getPlaceholderModel(key);
}

/**
 * Resolve a texture. Real path uses THREE.TextureLoader (PNG/WebP); KTX2 should instead go through
 * drei `useKTX2`/KTX2Loader at the R3F layer. Falls back to the procedural texture on failure.
 */
export async function loadTexture(key: AssetKey): Promise<THREE.Texture> {
  const entry = getAsset(key);
  if (entry.kind !== "texture") {
    devWarn(`loadTexture("${key}") is not a texture (kind=${entry.kind})`);
    return getMissingTexture();
  }
  if (config.useRealAssets && entry.path) {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(getAssetUrl(key));
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      const [rx, ry] = entry.placeholder.repeat ?? [1, 1];
      tex.repeat.set(rx, ry);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    } catch (err) {
      devWarn(`texture "${key}" failed to load — using placeholder`, err);
    }
  }
  return getPlaceholderTexture(key);
}

/** Resolve an HDRI environment. Real path lazy-loads RGBELoader for `.hdr`; else placeholder sky. */
export async function loadEnvironment(key: AssetKey): Promise<THREE.Texture> {
  const entry = getAsset(key);
  if (entry.kind !== "hdri") {
    devWarn(`loadEnvironment("${key}") is not an hdri (kind=${entry.kind})`);
    return getMissingTexture();
  }
  if (config.useRealAssets && entry.path) {
    try {
      const { RGBELoader } = await import("three/examples/jsm/loaders/RGBELoader.js");
      const tex = await new RGBELoader().loadAsync(getAssetUrl(key));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      return tex;
    } catch (err) {
      devWarn(`hdri "${key}" failed to load — using placeholder`, err);
    }
  }
  return getPlaceholderEnvironment(key);
}

/** Free every cached procedural/loaded resource (call on teardown/HMR to avoid GPU leaks). */
export function disposeAssetCache(): void {
  const disposeObject = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  };
  modelTemplates.forEach(disposeObject);
  loadedModelTemplates.forEach(disposeObject);
  textureCache.forEach((t) => t.dispose());
  materialCache.forEach((m) => m.dispose());
  envCache.forEach((t) => t.dispose());
  missingTexture?.dispose();
  missingTexture = null;
  modelTemplates.clear();
  loadedModelTemplates.clear();
  textureCache.clear();
  materialCache.clear();
  envCache.clear();
  audioUrlCache.clear();
}
