// Sprite maps: many short variants packed into one file to cut request/decode count. Times are
// in milliseconds `[offset, duration]` (Howler `SoundSpriteDefinitions`). These are the shared
// slice vocabularies; the sound-design subsystem ships the actual packed audio and may override
// a manifest entry's `sprite` map to match its own file.
import type { SoundSpriteDefinitions } from "howler";

/** Footstep variants per surface (used with a `footsteps_<surface>` packed asset). */
export const FOOTSTEP_SPRITES: SoundSpriteDefinitions = {
  step0: [0, 260],
  step1: [300, 260],
  step2: [600, 260],
  step3: [900, 260],
  step4: [1200, 260],
  step5: [1500, 260],
};

/** Shell-casing drops (bright, short). */
export const CASING_SPRITES: SoundSpriteDefinitions = {
  casing0: [0, 220],
  casing1: [260, 220],
  casing2: [520, 220],
  casing3: [780, 220],
};

/** Generic impacts keyed loosely by material family. */
export const IMPACT_SPRITES: SoundSpriteDefinitions = {
  concrete: [0, 400],
  metal: [450, 400],
  wood: [900, 400],
  glass: [1350, 500],
  flesh: [1900, 400],
  dirt: [2350, 400],
};

/** Bullet whizz-by / near-miss slices. */
export const WHIZZ_SPRITES: SoundSpriteDefinitions = {
  whizz0: [0, 300],
  whizz1: [350, 300],
  whizz2: [700, 300],
};

export type Surface = "concrete" | "grass" | "metal" | "water" | "sand" | "wood" | "dirt";
