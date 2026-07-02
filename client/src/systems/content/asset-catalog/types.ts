// Asset-catalog type contracts. Kept LOCAL to this subsystem (shared/** is off-limits during
// the wave) but modelled on gta6-build/08-content/asset-catalog.md so it can graduate into
// shared/assets.ts later with a copy-paste. Everything here is a serializable POJO type except
// the placeholder specs, which are *descriptions* of procedural geometry (also serializable) —
// the actual THREE objects are built by ./placeholders and cached by ./loader.

import type { Vec3Tuple } from "@sunbreak/shared";

/** Licenses we allow. Policy: default CC0; CC-BY only when credited; NC/ND are banned. */
export type AssetLicense =
  | "CC0-1.0"
  | "CC-BY-4.0"
  | "CC-BY-3.0"
  | "Mixamo" // Adobe royalty-free grant; only ever ship baked into our own GLBs
  | "Pixabay"; // Pixabay Content License (CC0-like, no standalone redistribution)

/** What a shipped file is, which decides how ./loader resolves + how it degrades to a placeholder. */
export type AssetKind = "model" | "texture" | "hdri" | "audio";

/** Coarse grouping for filtering/credits UIs. A model can be a vehicle, ped, prop, etc. */
export type AssetCategory =
  | "character"
  | "ped"
  | "animation"
  | "vehicle"
  | "weapon"
  | "building"
  | "road"
  | "prop"
  | "nature"
  | "surface"
  | "hdri"
  | "sfx"
  | "music";

/** Machine-readable provenance — one per shipped file (mirrors the spec's AssetCredit). */
export interface AssetCredit {
  /** Display name of the asset/pack, e.g. "Kenney Car Kit — Sedan". */
  name: string;
  /** Author/handle, e.g. "Kenney", "Quaternius", a Freesound user. */
  author: string;
  /** Site the asset comes from, e.g. "Kenney", "Poly Haven", "ambientCG". */
  source: string;
  /** Exact asset/pack URL to fetch from later. */
  url: string;
  license: AssetLicense;
  /** true only for CC-BY* — drives the in-game Credits screen requirement. */
  requiresAttribution: boolean;
  /** ISO date the file was actually obtained. Empty string = not fetched yet (placeholder only). */
  dateObtained: string;
}

// ── Placeholder specs ──────────────────────────────────────────────────────────────────────
// Real binaries aren't downloaded during the wave, so every entry ships a procedural spec that
// ./placeholders turns into a real THREE object. This is what makes "the game runs now" true.

export type ModelPlaceholderShape =
  | "capsule" // humanoids (characters/peds), sized to PLAYER_CAPSULE
  | "car" // vehicle body + 4 separable wheels
  | "wheel" // single wheel (Rapier raycast vehicle)
  | "weapon" // small elongated block held in hand
  | "building" // tall extruded block
  | "road" // flat tile
  | "tree" // trunk + canopy
  | "sign" // emissive neon plane
  | "box"; // generic prop fallback

export interface ModelPlaceholder {
  shape: ModelPlaceholderShape;
  /** Approx bounding size in meters [x, y, z]. Drives placeholder + collider hints. */
  size: Vec3Tuple;
  /** Base color (hex). */
  color: number;
  emissive?: number;
  metalness?: number;
  roughness?: number;
}

export type SurfacePattern =
  | "asphalt"
  | "concrete"
  | "paving"
  | "stucco"
  | "sand"
  | "metal"
  | "glass"
  | "brick"
  | "checker";

export interface TexturePlaceholder {
  pattern: SurfacePattern;
  /** Dominant tint (hex). */
  color: number;
  /** UV repeat applied to the generated map. */
  repeat?: [number, number];
  roughness?: number;
  metalness?: number;
}

export type SkyPreset = "dusk" | "noon" | "night" | "storm";

export interface HdriPlaceholder {
  sky: SkyPreset;
  /** Vertical gradient stops (hex) for the procedural equirect stand-in. */
  zenith: number;
  horizon: number;
  ground: number;
  /** Relative IBL intensity hint for consumers. */
  intensity?: number;
  /** Draw a soft sun disk (dusk/noon). */
  sun?: boolean;
}

export type AudioTone = "click" | "thud" | "engine" | "noise" | "siren" | "beep" | "silence";

export interface AudioPlaceholder {
  tone: AudioTone;
  durationMs: number;
  /** Fundamental frequency for tonal placeholders. */
  freqHz?: number;
  /** 0..1 output gain. */
  gain?: number;
  loop?: boolean;
}

// ── Catalog entries (discriminated on `kind`) ────────────────────────────────────────────────

interface BaseEntry {
  /** Stable logical key other subsystems reference (never a hardcoded path). */
  readonly key: string;
  readonly kind: AssetKind;
  readonly category: AssetCategory;
  /**
   * Path RELATIVE to the configured base ("/assets"). The real file lives here once fetched;
   * ./loader joins it with the base to form the public URL. Chosen to match the spec's
   * `/client/public/assets/...` layout.
   */
  readonly path: string;
  readonly credit: AssetCredit;
  /** Concrete "how to get the real file" note for the integrator/asset lead. */
  readonly fetch: string;
  readonly tags?: readonly string[];
}

export interface ModelEntry extends BaseEntry {
  readonly kind: "model";
  readonly placeholder: ModelPlaceholder;
  /** Animation clip names expected to be baked into the GLB (for characters/peds/anim libs). */
  readonly clips?: readonly string[];
  /** Collider bounding box hint (m) for Physics/Vehicles — defaults to placeholder.size. */
  readonly colliderBox?: Vec3Tuple;
}

export interface TextureEntry extends BaseEntry {
  readonly kind: "texture";
  readonly placeholder: TexturePlaceholder;
}

export interface HdriEntry extends BaseEntry {
  readonly kind: "hdri";
  readonly placeholder: HdriPlaceholder;
}

export interface AudioEntry extends BaseEntry {
  readonly kind: "audio";
  readonly placeholder: AudioPlaceholder;
  readonly loop?: boolean;
}

export type AssetEntry = ModelEntry | TextureEntry | HdriEntry | AudioEntry;

/** Runtime config for how the loader resolves URLs + whether real files are expected present. */
export interface AssetCatalogConfig {
  /** Public base path (or CDN origin) the relative entry paths hang off. */
  basePath: string;
  /**
   * false (default this wave) = always use procedural placeholders, never hit the network.
   * Flip to true once real files exist under /public/assets to attempt real loads (with
   * automatic per-asset fallback to the placeholder on any failure).
   */
  useRealAssets: boolean;
  /** Optional Draco decoder path for Draco-compressed GLBs (real-asset path only). */
  dracoDecoderPath?: string;
}
