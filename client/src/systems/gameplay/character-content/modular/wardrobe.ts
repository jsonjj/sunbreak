// The wardrobe registry: every swappable part, which slot it fills, and which palette channel it
// tints from. This is the single source of truth shared by the mesh builder (procedural template),
// the factory (visibility + tinting), and the archetype/lead configs (which variants they pick).

import type { PaletteChannel, Slot } from "../types";

export interface VariantDef {
  id: string;
  channel: PaletteChannel;
}

export const SLOTS: readonly Slot[] = [
  "hair",
  "torso",
  "legs",
  "feet",
  "hat",
  "eyewear",
  "accessory",
];

export const SLOT_VARIANTS: Readonly<Record<Slot, readonly VariantDef[]>> = {
  hair: [
    { id: "hair_short", channel: "hair" },
    { id: "hair_long", channel: "hair" },
    { id: "hair_bun", channel: "hair" },
    { id: "hair_afro", channel: "hair" },
    { id: "hair_ponytail", channel: "hair" },
    { id: "hair_buzz", channel: "hair" },
    { id: "hair_mohawk", channel: "hair" },
  ],
  torso: [
    { id: "torso_tee", channel: "clothing" },
    { id: "torso_jacket", channel: "clothing" },
    { id: "torso_tank", channel: "clothing" },
    { id: "torso_hoodie", channel: "clothing" },
    { id: "torso_vest", channel: "clothing" },
    { id: "torso_longsleeve", channel: "clothing" },
    { id: "torso_dress", channel: "clothing" },
  ],
  legs: [
    { id: "legs_pants", channel: "bottom" },
    { id: "legs_shorts", channel: "bottom" },
    { id: "legs_skirt", channel: "bottom" },
    { id: "legs_joggers", channel: "bottom" },
  ],
  feet: [
    { id: "feet_shoes", channel: "shoe" },
    { id: "feet_boots", channel: "shoe" },
    { id: "feet_sandals", channel: "shoe" },
  ],
  hat: [
    { id: "hat_cap", channel: "clothing" },
    { id: "hat_beanie", channel: "clothing" },
  ],
  eyewear: [
    { id: "glasses_round", channel: "detail" },
    { id: "glasses_sun", channel: "detail" },
  ],
  accessory: [
    { id: "acc_sling", channel: "accent" },
    { id: "acc_backpack", channel: "clothingDark" },
  ],
};

/** Every (slot, variant) pair, flattened — used by the template builder. */
export function eachVariant(): Array<{ slot: Slot; variant: VariantDef }> {
  const out: Array<{ slot: Slot; variant: VariantDef }> = [];
  for (const slot of SLOTS) {
    for (const variant of SLOT_VARIANTS[slot]) out.push({ slot, variant });
  }
  return out;
}

/** Mesh naming so the factory can recover (slot, variant) after SkeletonUtils.clone. */
export function partName(slot: Slot, variantId: string): string {
  return `${slot}::${variantId}`;
}

export function channelOf(slot: Slot, variantId: string): PaletteChannel {
  const v = SLOT_VARIANTS[slot].find((x) => x.id === variantId);
  return v?.channel ?? "clothing";
}

/** Is a variant id valid for the slot? (dev sanity for hand-authored configs) */
export function isValidVariant(slot: Slot, variantId: string): boolean {
  return SLOT_VARIANTS[slot].some((v) => v.id === variantId);
}
