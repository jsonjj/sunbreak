// The wardrobe registry: every swappable part, which slot it fills, and which palette channel it
// tints from. This is the single source of truth shared by the mesh builder (procedural template),
// the factory (visibility + tinting), and the archetype/lead configs (which variants they pick).

import type { PaletteChannel, Slot } from "../types";

export interface VariantDef {
  id: string;
  channel: PaletteChannel;
}

export const SLOTS: readonly Slot[] = ["hair", "torso", "legs", "feet", "hat", "accessory"];

export const SLOT_VARIANTS: Readonly<Record<Slot, readonly VariantDef[]>> = {
  hair: [
    { id: "hair_short", channel: "hair" },
    { id: "hair_long", channel: "hair" },
    { id: "hair_bun", channel: "hair" },
  ],
  torso: [
    { id: "torso_tee", channel: "clothing" },
    { id: "torso_jacket", channel: "clothing" },
    { id: "torso_tank", channel: "clothing" },
  ],
  legs: [
    { id: "legs_pants", channel: "clothingDark" },
    { id: "legs_shorts", channel: "clothingDark" },
    { id: "legs_skirt", channel: "clothingDark" },
  ],
  feet: [
    { id: "feet_shoes", channel: "shoe" },
    { id: "feet_boots", channel: "shoe" },
  ],
  hat: [{ id: "hat_cap", channel: "clothing" }],
  accessory: [{ id: "acc_sling", channel: "accent" }],
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
