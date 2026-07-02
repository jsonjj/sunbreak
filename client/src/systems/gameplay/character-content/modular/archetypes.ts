// Ped archetypes: deterministic (bodies × outfits × palette) look generation from a seed. Mirrors
// PedArchetype from shared (civilian/business/tourist/gangster/police). Each archetype has curated
// pools — bodies, hair, tops, bottoms, shoes, hats, eyewear, accessories — so a crowd reads as a
// believable, non-cloned mix while staying reproducible for save/network parity.

import type { Appearance, BodyId } from "../types";
import { chance, mulberry32, hashString, pick } from "../util/rng";
import { randomPalette } from "./palette";

export type PedKind = "civilian" | "business" | "tourist" | "gangster" | "police";

interface ArchetypeCfg {
  bodies: readonly BodyId[];
  mood: string;
  hair: readonly string[];
  baldChance: number;
  torso: readonly string[];
  legs: readonly string[];
  feet: readonly string[];
  hats: readonly string[];
  hatChance: number;
  eyewear: readonly string[];
  eyewearChance: number;
  accessories: readonly string[];
  accessoryChance: number;
}

const ARCHETYPES: Readonly<Record<PedKind, ArchetypeCfg>> = {
  civilian: {
    bodies: ["medium", "slim", "heavy", "athletic", "stocky"],
    mood: "neutral",
    hair: ["hair_short", "hair_long", "hair_bun", "hair_afro", "hair_ponytail", "hair_buzz"],
    baldChance: 0.08,
    torso: ["torso_tee", "torso_tank", "torso_jacket", "torso_hoodie", "torso_longsleeve", "torso_dress"],
    legs: ["legs_pants", "legs_shorts", "legs_skirt", "legs_joggers"],
    feet: ["feet_shoes", "feet_boots", "feet_sandals"],
    hats: ["hat_cap", "hat_beanie"],
    hatChance: 0.16,
    eyewear: ["glasses_round", "glasses_sun"],
    eyewearChance: 0.22,
    accessories: ["acc_sling", "acc_backpack"],
    accessoryChance: 0.22,
  },
  business: {
    bodies: ["medium", "slim", "athletic"],
    mood: "business",
    hair: ["hair_short", "hair_bun", "hair_buzz", "hair_ponytail"],
    baldChance: 0.16,
    torso: ["torso_jacket", "torso_vest", "torso_longsleeve"],
    legs: ["legs_pants"],
    feet: ["feet_shoes"],
    hats: ["hat_cap"],
    hatChance: 0.04,
    eyewear: ["glasses_round"],
    eyewearChance: 0.4,
    accessories: ["acc_sling", "acc_backpack"],
    accessoryChance: 0.4,
  },
  tourist: {
    bodies: ["medium", "heavy", "slim", "stocky"],
    mood: "tourist",
    hair: ["hair_short", "hair_long", "hair_ponytail", "hair_afro"],
    baldChance: 0.05,
    torso: ["torso_tee", "torso_tank", "torso_hoodie", "torso_dress"],
    legs: ["legs_shorts", "legs_pants", "legs_skirt"],
    feet: ["feet_shoes", "feet_sandals"],
    hats: ["hat_cap", "hat_beanie"],
    hatChance: 0.55,
    eyewear: ["glasses_sun"],
    eyewearChance: 0.6,
    accessories: ["acc_backpack", "acc_sling"],
    accessoryChance: 0.6,
  },
  gangster: {
    bodies: ["medium", "heavy", "athletic", "stocky"],
    mood: "gang",
    hair: ["hair_short", "hair_buzz", "hair_bun", "hair_mohawk"],
    baldChance: 0.22,
    torso: ["torso_jacket", "torso_tank", "torso_hoodie", "torso_vest"],
    legs: ["legs_pants", "legs_joggers"],
    feet: ["feet_boots", "feet_shoes"],
    hats: ["hat_cap", "hat_beanie"],
    hatChance: 0.4,
    eyewear: ["glasses_sun"],
    eyewearChance: 0.35,
    accessories: ["acc_sling"],
    accessoryChance: 0.25,
  },
  police: {
    bodies: ["medium", "heavy", "athletic", "stocky"],
    mood: "police",
    hair: ["hair_short", "hair_buzz", "hair_bun"],
    baldChance: 0.15,
    torso: ["torso_jacket"],
    legs: ["legs_pants"],
    feet: ["feet_boots"],
    hats: ["hat_cap"],
    hatChance: 1,
    eyewear: ["glasses_sun"],
    eyewearChance: 0.4,
    accessories: ["acc_sling"],
    accessoryChance: 1,
  },
};

export function isPedKind(kind: string): kind is PedKind {
  return kind in ARCHETYPES;
}

/** Generate a reproducible appearance for a ped archetype. */
export function appearanceForArchetype(kind: PedKind, seed: number): Appearance {
  const cfg = ARCHETYPES[kind];
  const rand = mulberry32(hashString(`${kind}:${seed >>> 0}`));
  const torso = pick(cfg.torso, rand);
  // A dress covers the legs, so leave the legs slot bare beneath it.
  const legs = torso === "torso_dress" ? null : pick(cfg.legs, rand);
  return {
    bodyId: pick(cfg.bodies, rand),
    palette: randomPalette(rand, cfg.mood),
    wardrobe: {
      hair: chance(cfg.baldChance, rand) ? null : pick(cfg.hair, rand),
      torso,
      legs,
      feet: pick(cfg.feet, rand),
      hat: cfg.hats.length > 0 && chance(cfg.hatChance, rand) ? pick(cfg.hats, rand) : null,
      eyewear:
        cfg.eyewear.length > 0 && chance(cfg.eyewearChance, rand) ? pick(cfg.eyewear, rand) : null,
      accessory:
        cfg.accessories.length > 0 && chance(cfg.accessoryChance, rand)
          ? pick(cfg.accessories, rand)
          : null,
    },
  };
}
