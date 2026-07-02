// Ped archetypes: deterministic (bodies × outfits × palette) look generation from a seed. Mirrors
// PedArchetype from shared (civilian/business/tourist/gangster/police). Districts can later weight
// these; for now each archetype has curated pools so a crowd reads as a believable mix.

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
  hat: string | null;
  hatChance: number;
  accessoryChance: number;
}

const ARCHETYPES: Readonly<Record<PedKind, ArchetypeCfg>> = {
  civilian: {
    bodies: ["medium", "slim", "heavy"],
    mood: "neutral",
    hair: ["hair_short", "hair_long", "hair_bun"],
    baldChance: 0.1,
    torso: ["torso_tee", "torso_tank", "torso_jacket"],
    legs: ["legs_pants", "legs_shorts", "legs_skirt"],
    feet: ["feet_shoes"],
    hat: "hat_cap",
    hatChance: 0.15,
    accessoryChance: 0.2,
  },
  business: {
    bodies: ["medium", "slim"],
    mood: "business",
    hair: ["hair_short", "hair_bun"],
    baldChance: 0.15,
    torso: ["torso_jacket"],
    legs: ["legs_pants"],
    feet: ["feet_shoes"],
    hat: null,
    hatChance: 0,
    accessoryChance: 0.35,
  },
  tourist: {
    bodies: ["medium", "heavy", "slim"],
    mood: "tourist",
    hair: ["hair_short", "hair_long"],
    baldChance: 0.05,
    torso: ["torso_tee", "torso_tank"],
    legs: ["legs_shorts", "legs_pants"],
    feet: ["feet_shoes"],
    hat: "hat_cap",
    hatChance: 0.55,
    accessoryChance: 0.5,
  },
  gangster: {
    bodies: ["medium", "heavy"],
    mood: "gang",
    hair: ["hair_short", "hair_bun"],
    baldChance: 0.25,
    torso: ["torso_jacket", "torso_tank"],
    legs: ["legs_pants"],
    feet: ["feet_boots", "feet_shoes"],
    hat: "hat_cap",
    hatChance: 0.35,
    accessoryChance: 0.3,
  },
  police: {
    bodies: ["medium", "heavy"],
    mood: "police",
    hair: ["hair_short", "hair_bun"],
    baldChance: 0.15,
    torso: ["torso_jacket"],
    legs: ["legs_pants"],
    feet: ["feet_boots"],
    hat: "hat_cap",
    hatChance: 1,
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
  return {
    bodyId: pick(cfg.bodies, rand),
    palette: randomPalette(rand, cfg.mood),
    wardrobe: {
      hair: chance(cfg.baldChance, rand) ? null : pick(cfg.hair, rand),
      torso: pick(cfg.torso, rand),
      legs: pick(cfg.legs, rand),
      feet: pick(cfg.feet, rand),
      hat: cfg.hat && chance(cfg.hatChance, rand) ? cfg.hat : null,
      accessory: chance(cfg.accessoryChance, rand) ? "acc_sling" : null,
    },
  };
}
