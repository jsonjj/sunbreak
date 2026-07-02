// Curated color palettes (no random neon). Appearances store the chosen base hexes; derived
// channels (darker clothing, shoes, accents) are computed from the base so a whole crowd shares
// a tiny set of materials keyed by (channel, hex) in the MaterialCache.

import * as THREE from "three";
import type { Palette, PaletteChannel } from "../types";
import { pick } from "../util/rng";

export const SKIN_TONES: readonly string[] = [
  "#f6d5bd",
  "#eabd98",
  "#d69f76",
  "#b97f50",
  "#8d5a34",
  "#5e3a22",
];

export const HAIR_TONES: readonly string[] = [
  "#1b1a19",
  "#2e2018",
  "#4a3120",
  "#7a4b28",
  "#b07a3c",
  "#c9b489",
  "#9a9ea3",
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
];

/** Archetype-biased clothing sub-palettes. */
export const CLOTHING_BY_MOOD: Readonly<Record<string, readonly string[]>> = {
  neutral: CLOTHING_TONES,
  business: ["#2b3345", "#3a3f4a", "#4a4e57", "#5b4636", "#2f3b45"],
  tourist: ["#c94f4f", "#d99b2b", "#3f8f8f", "#e0c15a", "#b0752f", "#4a8f5a"],
  gang: ["#2a2a2e", "#5a1f1f", "#1f3a2a", "#3a2a4a", "#40332a"],
  police: ["#22304a"],
};

const _c = new THREE.Color();

function darken(hex: string, amount: number): string {
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
      return darken(palette.clothing, 0.62);
    case "shoe":
      return "#242526";
    case "accent":
      return darken(palette.clothing, 0.85);
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
  return {
    skin: pick(SKIN_TONES, rand),
    hair: pick(HAIR_TONES, rand),
    clothing: pick(clothingSet, rand),
  };
}
