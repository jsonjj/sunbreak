// Zustand store SHAPES (types only — implementations live in client/src/stores). Shared so
// the client, HUD, save system, and (v4) netcode agree on the view/session-state contract.

import type { Blip, HeatTier } from "../types/hud";
import type { CharacterId } from "../types/entities";
import type { SettingsState } from "../types/settings";

export type GamePhase = "boot" | "menu" | "loading" | "playing" | "paused" | "cutscene";

export interface GameStoreState {
  phase: GamePhase;
  activeCharacter: CharacterId;
  loadProgress: number; // 0..1
}

export interface HudStoreState {
  health: number;
  armor: number;
  stamina: number;
  heat: HeatTier;
  cash: number;
  bank: number;
  ability: number; // 0..1
  speedKmh: number;
  weapon: string | null;
  ammoClip: number;
  ammoReserve: number;
  inVehicle: boolean;
  blips: Blip[];
}

export type PauseTab = "map" | "missions" | "stats" | "gallery" | "settings" | "online";

export interface Toast {
  id: string;
  text: string;
}

export interface UiStoreState {
  activeMenu: string | null;
  pauseTab: PauseTab;
  weaponWheelOpen: boolean;
  interactionMenuOpen: boolean;
  mapOpen: boolean;
  phone: { open: boolean; app: string | null };
  toasts: Toast[];
  contextPrompt: string | null;
}

/** The persisted settings store (localStorage) is exactly the SettingsState schema. */
export type SettingsStoreState = SettingsState;
