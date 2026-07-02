// The reactive vitals surface the HUD subscribes to. This is RICHER than the shared
// `useHudStore` (which only carries health/armor/stamina/ability): it adds maxes, the
// alive/exhausted/canSprint flags, the death-fade overlay, and the current stamina intent —
// everything a damage vignette, stamina ring, or death overlay needs. Systems write it via
// `patch(...)`; HUD components read fine-grained selectors so bars only re-render on change.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { CharacterId } from "@sunbreak/shared";
import { MAX_ARMOR, MAX_HEALTH, STAMINA_BASE } from "./constants";
import type { RespawnPhase, RespawnReason, StaminaIntent } from "./types";

export interface StatStoreState {
  active: CharacterId;
  health: number;
  healthMax: number;
  armor: number;
  armorMax: number;
  /** Raw stamina (0..staminaMax). */
  stamina: number;
  staminaMax: number;
  /** 0..1 remaining fraction (radial ring). */
  staminaFrac: number;
  ability: number; // 0..1
  alive: boolean;
  exhausted: boolean;
  canSprint: boolean;
  /** performance.now() ms of last damage (drives the damage vignette flash). */
  lastDamageAt: number;
  // death → respawn overlay
  respawnPhase: RespawnPhase;
  respawnReason: RespawnReason | null;
  /** 0 = clear, 1 = fully black. Drive a full-screen overlay's opacity from this. */
  fade: number;
  intent: StaminaIntent;

  patch: (p: Partial<StatSnapshot>) => void;
  setIntent: (intent: StaminaIntent) => void;
}

/** Everything systems write (the state minus the actions). */
export type StatSnapshot = Omit<StatStoreState, "patch" | "setIntent">;

export const useStatStore = create<StatStoreState>()(
  subscribeWithSelector((set) => ({
    active: CharacterId.Cami,
    health: MAX_HEALTH,
    healthMax: MAX_HEALTH,
    armor: 0,
    armorMax: MAX_ARMOR,
    stamina: STAMINA_BASE,
    staminaMax: STAMINA_BASE,
    staminaFrac: 1,
    ability: 0,
    alive: true,
    exhausted: false,
    canSprint: true,
    lastDamageAt: 0,
    respawnPhase: "alive",
    respawnReason: null,
    fade: 0,
    intent: "none",
    patch: (p) => set(p),
    setIntent: (intent) => set({ intent }),
  })),
);
