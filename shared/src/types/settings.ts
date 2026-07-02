// Settings schema — the ONLY persisted store (localStorage). Versioned + migratable.

export type QualityTier = "low" | "medium" | "high";
export type ColorblindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export interface SettingsState {
  audio: {
    master: number; // 0..1
    music: number;
    sfx: number;
    voice: number;
  };
  graphics: {
    quality: QualityTier;
    auto: boolean; // auto-scale quality at runtime
    fov: number;
    motionBlur: boolean;
  };
  controls: {
    mouseSensitivity: number;
    invertY: boolean;
    sprintToggle: boolean;
    aimToggle: boolean;
  };
  accessibility: {
    hudScale: number; // 0.75..1.5
    hudOpacity: number; // 0..1
    reduceShake: boolean;
    reduceFlashing: boolean;
    colorblind: ColorblindMode;
    subtitles: boolean;
  };
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: SettingsState = {
  audio: { master: 0.8, music: 0.7, sfx: 0.9, voice: 1.0 },
  graphics: { quality: "high", auto: true, fov: 60, motionBlur: false },
  controls: { mouseSensitivity: 1.0, invertY: false, sprintToggle: false, aimToggle: false },
  accessibility: {
    hudScale: 1.0,
    hudOpacity: 1.0,
    reduceShake: false,
    reduceFlashing: false,
    colorblind: "none",
    subtitles: true,
  },
};
