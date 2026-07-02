// Mixer categories: the audio buses every sound is routed through. Each category has a
// default volume, a default 3D panner profile, and a per-category concurrent-voice cap.
import type { PannerAttributes } from "howler";

/** All mixable sound buses. `master` is a global multiplier, not a routable category. */
export const CATEGORIES = [
  "music",
  "radio",
  "ambience",
  "vehicles",
  "weapons",
  "footsteps",
  "impacts",
  "ui",
  "dialogue",
] as const;

export type Category = (typeof CATEGORIES)[number];
/** A mixer channel: any category, or the global master. */
export type MixChannel = Category | "master";
export type PanningModel = NonNullable<PannerAttributes["panningModel"]>;

/** Default per-category volumes (0..1). Persisted values in the mixer store override these. */
export const DEFAULT_CATEGORY_VOLUME: Record<Category, number> = {
  music: 0.7,
  radio: 0.7,
  ambience: 0.6,
  vehicles: 0.8,
  weapons: 0.9,
  footsteps: 0.7,
  impacts: 0.8,
  ui: 0.6,
  dialogue: 1.0,
};

/** Default master volume. */
export const DEFAULT_MASTER_VOLUME = 0.9;

/**
 * Default 3D panner attributes per category (meters; `distanceModel: 'inverse'`).
 * HRTF is reserved for near/high-priority buses; the many/low-priority buses use the
 * cheaper `equalpower` model. Assets may override these per-asset in the manifest.
 */
export const DEFAULT_PANNER: Record<Category, PannerAttributes> = {
  footsteps: { refDistance: 1, maxDistance: 25, rolloffFactor: 1.2, distanceModel: "inverse", panningModel: "equalpower" },
  impacts: { refDistance: 2, maxDistance: 60, rolloffFactor: 1.0, distanceModel: "inverse", panningModel: "equalpower" },
  weapons: { refDistance: 5, maxDistance: 350, rolloffFactor: 0.9, distanceModel: "inverse", panningModel: "HRTF" },
  vehicles: { refDistance: 4, maxDistance: 180, rolloffFactor: 1.0, distanceModel: "inverse", panningModel: "HRTF" },
  ambience: { refDistance: 8, maxDistance: 60, rolloffFactor: 1.0, distanceModel: "inverse", panningModel: "equalpower" },
  dialogue: { refDistance: 3, maxDistance: 40, rolloffFactor: 1.0, distanceModel: "inverse", panningModel: "HRTF" },
  // Non-spatial buses (played in 2D) — provided for completeness/fallback only.
  music: { refDistance: 1, maxDistance: 10000, rolloffFactor: 0, distanceModel: "inverse", panningModel: "equalpower" },
  radio: { refDistance: 1, maxDistance: 10000, rolloffFactor: 0, distanceModel: "inverse", panningModel: "equalpower" },
  ui: { refDistance: 1, maxDistance: 10000, rolloffFactor: 0, distanceModel: "inverse", panningModel: "equalpower" },
};

/** A safe default panner for spatial one-shots whose category has no spatial profile. */
export const FALLBACK_PANNER: PannerAttributes = {
  refDistance: 2,
  maxDistance: 80,
  rolloffFactor: 1.0,
  distanceModel: "inverse",
  panningModel: "equalpower",
};

/** Per-category concurrent-voice caps. The global cap (quality-tiered) also applies. */
export const CATEGORY_VOICE_CAP: Record<Category, number> = {
  footsteps: 6,
  impacts: 8,
  weapons: 10,
  vehicles: 8,
  ambience: 12,
  ui: 4,
  dialogue: 2,
  music: 1,
  radio: 1,
};

/** Default priority per category (higher = harder to steal / more likely to win a slot). */
export const CATEGORY_PRIORITY: Record<Category, number> = {
  dialogue: 100,
  weapons: 80,
  music: 70,
  radio: 70,
  vehicles: 60,
  impacts: 50,
  ambience: 40,
  footsteps: 30,
  ui: 90,
};

/** Categories streamed via HTML5 (never decoded fully into RAM). */
export const STREAMING_CATEGORIES: ReadonlySet<Category> = new Set(["music", "radio"]);

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
