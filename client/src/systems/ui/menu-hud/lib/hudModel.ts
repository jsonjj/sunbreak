import type { HeatTier } from "@sunbreak/shared";

/** The store carries no explicit maxima, so the bars scale against these full-scale values. */
export const HUD_MAX = { health: 100, armor: 100, stamina: 100 } as const;

/** WeaponId (string) → display label. Unknown ids fall back to "Unarmed". */
export const WEAPON_LABEL: Record<string, string> = {
  unarmed: "Unarmed",
  fists: "Fists",
  pistol: "Pistol",
  smg: "SMG",
  rifle: "Rifle",
  shotgun: "Shotgun",
};

/** 0..5 wanted heat → short status word. */
export const HEAT_LABEL: Record<HeatTier, string> = {
  0: "Clear",
  1: "Noticed",
  2: "Wanted",
  3: "Pursued",
  4: "Hunted",
  5: "Maximum",
};
