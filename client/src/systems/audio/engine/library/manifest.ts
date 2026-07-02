// The audio catalog: a runtime registry mapping asset ids -> load/playback descriptors. It is
// intentionally OPEN — the sound, radio and ambience subsystems (which own their asset files)
// call `registerAsset(s)` to add or override entries. A handful of canonical placeholder ids are
// seeded here so consumers share a vocabulary; real paths are filled in by those subsystems.
import type { PannerAttributes, SoundSpriteDefinitions } from "howler";
import type { Category } from "../mixer/categories";

/** Asset ids are plain strings so any subsystem can register its own without a central enum. */
export type AssetId = string;

export interface AudioAsset {
  id: AssetId;
  /** Ordered source URLs (browser picks first playable): `.webm` (Opus) then `.m4a`/`.mp3`. */
  src: string[];
  category: Category;
  /** Steal/priority weight; defaults to the category priority. */
  priority?: number;
  /** Per-asset 3D panner override (merged over the category default). */
  panner?: PannerAttributes;
  /** Sprite slice map (for packed multi-variant files). */
  sprite?: SoundSpriteDefinitions;
  /** Max simultaneous instances of THIS asset (independent of the global voice cap). */
  maxInstances?: number;
  /** Base volume for the asset (0..1), before category/master. */
  volume?: number;
  /** Loop the source (emitters/beds). */
  loop?: boolean;
  /** Stream via HTML5 instead of decoding into RAM (music/radio). */
  html5?: boolean;
  /** Preload eagerly at registration (warm high-frequency SFX). */
  preload?: boolean;
  /** Howler inactive-sound pool size (defaults sensibly per Howler). */
  pool?: number;
}

/** Canonical placeholder ids so gameplay can reference a stable vocabulary before assets ship. */
export type BuiltinAssetId =
  | "ui_click"
  | "ui_back"
  | "footsteps_concrete"
  | "footsteps_grass"
  | "footsteps_metal"
  | "impacts"
  | "casings"
  | "weapon_pistol"
  | "vehicle_engine"
  | "ambience_city";

const REGISTRY = new Map<AssetId, AudioAsset>();
const warned = new Set<AssetId>();

/** Public-folder base for shipped audio (`client/public/audio/...`). */
export const AUDIO_BASE = "/audio";

/** Build the standard `[webm, m4a, mp3]` fallback list for a base path under `AUDIO_BASE`. */
export function sources(path: string, formats: readonly string[] = ["webm", "m4a", "mp3"]): string[] {
  const clean = path.replace(/^\/+/, "").replace(/\.[a-z0-9]+$/i, "");
  return formats.map((f) => `${AUDIO_BASE}/${clean}.${f}`);
}

export function registerAsset(asset: AudioAsset): void {
  REGISTRY.set(asset.id, asset);
}

export function registerAssets(assets: readonly AudioAsset[]): void {
  for (const a of assets) REGISTRY.set(a.id, a);
}

export function getAsset(id: AssetId): AudioAsset | undefined {
  const a = REGISTRY.get(id);
  if (!a && !warned.has(id)) {
    warned.add(id);
    console.warn(`[audio] unknown asset "${id}" — register it via registerAsset() first.`);
  }
  return a;
}

export function hasAsset(id: AssetId): boolean {
  return REGISTRY.has(id);
}

export function allAssets(): AudioAsset[] {
  return [...REGISTRY.values()];
}

export function assetIds(): AssetId[] {
  return [...REGISTRY.keys()];
}

// ── Seed placeholder catalog ────────────────────────────────────────────────
// These point at conventional public paths. If a file is missing, the SoundPool logs one
// load error and the id becomes a no-op; the owning subsystem overrides with real assets.
registerAssets([
  { id: "ui_click", src: sources("ui/click"), category: "ui", volume: 0.8, preload: true },
  { id: "ui_back", src: sources("ui/back"), category: "ui", volume: 0.8 },
  { id: "footsteps_concrete", src: sources("footsteps/concrete"), category: "footsteps", maxInstances: 4, preload: true },
  { id: "footsteps_grass", src: sources("footsteps/grass"), category: "footsteps", maxInstances: 4 },
  { id: "footsteps_metal", src: sources("footsteps/metal"), category: "footsteps", maxInstances: 4 },
  { id: "impacts", src: sources("impacts/impacts"), category: "impacts", maxInstances: 6 },
  { id: "casings", src: sources("weapons/casings"), category: "impacts", maxInstances: 6, volume: 0.6 },
  { id: "weapon_pistol", src: sources("weapons/pistol"), category: "weapons", maxInstances: 4, priority: 90 },
  { id: "vehicle_engine", src: sources("vehicles/engine_loop"), category: "vehicles", loop: true, maxInstances: 8 },
  { id: "ambience_city", src: sources("ambience/city_day"), category: "ambience", loop: true, html5: true, maxInstances: 2 },
]);
