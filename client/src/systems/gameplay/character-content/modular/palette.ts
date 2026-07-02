// Curated color palettes (no random neon). Appearances store the chosen base hexes; derived
// channels (darker clothing, distinct bottoms, shoes, accents, eye/detail) are computed from the
// base so a whole crowd shares a tiny set of materials keyed by (channel, hex) in the MaterialCache.

import * as THREE from "three";
import type { Palette, PaletteChannel } from "../types";
import { pick } from "../util/rng";

// A believable spread of human skin tones (warm→deep). Kept deliberately broad for crowd variety.
export const SKIN_TONES: readonly string[] = [
  "#f7d7c4",
  "#f0c4a4",
  "#e6ac86",
  "#d69f76",
  "#c88a5e",
  "#b97f50",
  "#a06a42",
  "#8d5a34",
  "#6f4529",
  "#5e3a22",
  "#4a2e1c",
];

// Natural hair colours + a few tasteful dyes.
export const HAIR_TONES: readonly string[] = [
  "#0f0d0c", // near-black
  "#1b1a19",
  "#2e2018",
  "#3d2a1c",
  "#4a3120",
  "#6b4326",
  "#7a4b28",
  "#9a6a34",
  "#b07a3c",
  "#c9b489", // dark blonde
  "#ded2a8", // light blonde
  "#8a8f95", // grey
  "#b9bec4", // silver
  "#5a3038", // auburn dye
  "#33474a", // muted teal-black dye
];

/** General-purpose clothing colors — muted, city-appropriate. */
export const CLOTHING_TONES: readonly string[] = [
  "#3a4a63",
  "#455a4b",
  "#7a3b3b",
  "#8a7a3b",
  "#4a3b63",
  "#333a40",
  "#b0752f",
  "#5a6b7a",
  "#874b6a",
  "#2f6b63",
  "#6a6f77",
  "#9c9488",
  "#c2c7cc",
];

/** Bottoms (trousers / skirts) — denim, khaki, greys, blacks. */
export const BOTTOM_TONES: readonly string[] = [
  "#2c3038",
  "#3a4048",
  "#4a5560",
  "#2f3f52", // denim
  "#5b5346", // khaki
  "#6a6157",
  "#26292e",
  "#454138",
  "#7c756a",
];

/** Archetype-biased clothing sub-palettes (tops). */
export const CLOTHING_BY_MOOD: Readonly<Record<string, readonly string[]>> = {
  neutral: CLOTHING_TONES,
  business: ["#2b3345", "#3a3f4a", "#4a4e57", "#5b4636", "#2f3b45", "#63533f", "#4d4a53"],
  tourist: ["#c94f4f", "#d99b2b", "#3f8f8f", "#e0c15a", "#b0752f", "#4a8f5a", "#d76c9c", "#4f7fd7"],
  gang: ["#2a2a2e", "#5a1f1f", "#1f3a2a", "#3a2a4a", "#40332a", "#1e1e22"],
  police: ["#22304a"],
};

/** Archetype-biased bottoms sub-palettes. */
export const BOTTOM_BY_MOOD: Readonly<Record<string, readonly string[]>> = {
  neutral: BOTTOM_TONES,
  business: ["#2b2f38", "#33373f", "#3d4048", "#4a4436"],
  tourist: ["#5b6470", "#7c756a", "#8a8272", "#4a5560", "#5b5346"],
  gang: ["#1f2024", "#26292e", "#2c2a30", "#332e2a"],
  police: ["#1c2434"],
};

const _c = new THREE.Color();

function scaleHex(hex: string, amount: number): string {
  _c.set(hex);
  _c.multiplyScalar(amount);
  return `#${_c.getHexString()}`;
}

/** Resolve the concrete hex for a channel from a base palette. */
export function resolveColor(channel: PaletteChannel, palette: Palette): string {
  switch (channel) {
    case "skin":
      return palette.skin;
    case "hair":
      return palette.hair;
    case "clothing":
      return palette.clothing;
    case "clothingDark":
      return scaleHex(palette.clothing, 0.62);
    case "bottom":
      return palette.clothing2 ?? scaleHex(palette.clothing, 0.72);
    case "shoe":
      return "#242526";
    case "accent":
      return scaleHex(palette.clothing, 0.85);
    case "detail":
      // Eyes / brows / dark seams. A cool near-black reads as facial features against any skin.
      return "#26221f";
    default:
      return palette.clothing;
  }
}

/** Stable cache key for a (channel, palette) material. */
export function materialKey(channel: PaletteChannel, palette: Palette): string {
  return `${channel}:${resolveColor(channel, palette)}`;
}

/** Build a random-but-curated base palette. */
export function randomPalette(rand: () => number, mood = "neutral"): Palette {
  const clothingSet = CLOTHING_BY_MOOD[mood] ?? CLOTHING_TONES;
  const bottomSet = BOTTOM_BY_MOOD[mood] ?? BOTTOM_TONES;
  return {
    skin: pick(SKIN_TONES, rand),
    hair: pick(HAIR_TONES, rand),
    clothing: pick(clothingSet, rand),
    clothing2: pick(bottomSet, rand),
  };
}
