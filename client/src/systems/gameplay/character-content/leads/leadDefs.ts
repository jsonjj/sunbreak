// The two playable leads (Santa Vista): Cami & Mac. Each is a set of hand-authored wardrobe states
// (Appearance) plus an ability id + spawn. Original looks built from CC0 bases only (anti-clone).

import type { AbilityId, Appearance, LeadId } from "../types";

export interface LeadDef {
  id: LeadId;
  name: string;
  ability: AbilityId;
  spawn: readonly [number, number, number];
  defaultState: string;
  states: Readonly<Record<string, Appearance>>;
}

// Cami — clinic nurse by day; "focus" ability (bullet-time-ish precision).
export const CAMI: LeadDef = {
  id: "cami",
  name: "Cami",
  ability: "focus",
  spawn: [0, 0, 6],
  defaultState: "street",
  states: {
    street: {
      bodyId: "slim",
      palette: { skin: "#eabd98", hair: "#2e2018", clothing: "#2f6b63" },
      wardrobe: { hair: "hair_long", torso: "torso_tee", legs: "legs_pants", feet: "feet_shoes", hat: null, accessory: null },
    },
    clinic: {
      bodyId: "slim",
      palette: { skin: "#eabd98", hair: "#2e2018", clothing: "#dfe4e8" },
      wardrobe: { hair: "hair_bun", torso: "torso_jacket", legs: "legs_pants", feet: "feet_shoes", hat: null, accessory: null },
    },
    party: {
      bodyId: "slim",
      palette: { skin: "#eabd98", hair: "#33474a", clothing: "#874b6a" },
      wardrobe: { hair: "hair_long", torso: "torso_tank", legs: "legs_skirt", feet: "feet_shoes", hat: null, accessory: "acc_sling" },
    },
  },
};

// Mac — dock/mechanic; "overdrive" ability (adrenaline/strength surge).
export const MAC: LeadDef = {
  id: "mac",
  name: "Mac",
  ability: "overdrive",
  spawn: [2, 0, 6],
  defaultState: "work",
  states: {
    work: {
      bodyId: "heavy",
      palette: { skin: "#b97f50", hair: "#1b1a19", clothing: "#5b4636" },
      wardrobe: { hair: "hair_short", torso: "torso_jacket", legs: "legs_pants", feet: "feet_boots", hat: "hat_cap", accessory: null },
    },
    street: {
      bodyId: "heavy",
      palette: { skin: "#b97f50", hair: "#1b1a19", clothing: "#3a4a63" },
      wardrobe: { hair: "hair_short", torso: "torso_tee", legs: "legs_pants", feet: "feet_boots", hat: null, accessory: null },
    },
  },
};

export const LEADS: Readonly<Record<LeadId, LeadDef>> = { cami: CAMI, mac: MAC };

export function isLeadId(kind: string): kind is LeadId {
  return kind === "cami" || kind === "mac";
}

export function getLeadDef(id: LeadId): LeadDef {
  return LEADS[id];
}
