// HUD readout contract — the quantized values the HUD bridge samples from the sim.

export type HeatTier = 0 | 1 | 2 | 3 | 4 | 5;

export type BlipKind = "player" | "mission" | "vehicle" | "enemy" | "shop" | "waypoint";

export interface Blip {
  id: string;
  x: number;
  z: number;
  kind: BlipKind;
  label?: string;
}

export interface HudSnapshot {
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
