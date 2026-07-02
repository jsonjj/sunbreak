// The SUNBREAK sound-design catalog: game event -> sound. This is the CC0 "SFX config".
//
// Every id maps to a `ClipDef` describing the mixer bus, playback params, optional CC0 asset
// URLs, and a procedural `synth` fallback so the game is audible before any binary audio ships.
// `SoundEventId` is derived from this object, so the catalog is the single source of truth and
// typos in `playEvent("...")` are caught at compile time.
//
// Assets convention (dropped in later by the CC0 asset pipeline — Kenney / Freesound CC0):
//   client/public/audio/sfx/<category>/<name>.webm  (+ .mp3 Safari fallback)

import type { ClipDef, SfxBus } from "./types";

/** Two-format candidate list for one CC0 clip (webm primary, mp3 fallback). */
const A = (category: string, name: string): string[] => [
  `/audio/sfx/${category}/${name}.webm`,
  `/audio/sfx/${category}/${name}.mp3`,
];

/** Per-bus playback defaults; entries override individual fields. */
export const BUS_DEFAULTS: Record<
  SfxBus,
  { positional: boolean; refDistance: number; maxDistance: number; rolloff: number; priority: number }
> = {
  sfx: { positional: true, refDistance: 4, maxDistance: 90, rolloff: 1.1, priority: 4 },
  vehicles: { positional: true, refDistance: 6, maxDistance: 180, rolloff: 1.0, priority: 5 },
  ambience: { positional: false, refDistance: 8, maxDistance: 120, rolloff: 1.0, priority: 2 },
  ui: { positional: false, refDistance: 1, maxDistance: 10, rolloff: 1.0, priority: 3 },
  music: { positional: false, refDistance: 1, maxDistance: 10, rolloff: 1.0, priority: 6 },
  voice: { positional: true, refDistance: 3, maxDistance: 40, rolloff: 1.0, priority: 7 },
};

export const CATALOG = {
  // ── Footsteps (surface-aware) ──────────────────────────────────────────────
  footstep_concrete: {
    bus: "sfx", assets: A("footsteps", "concrete"),
    synth: { kind: "noise_burst", durationMs: 130, lowpass: 2600, decay: 0.85, noise: "white" },
    volume: 0.5, pitchVar: 0.12, cooldownMs: 45, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 30,
  },
  footstep_grass: {
    bus: "sfx", assets: A("footsteps", "grass"),
    synth: { kind: "noise_burst", durationMs: 150, lowpass: 1200, decay: 0.7, noise: "pink" },
    volume: 0.42, pitchVar: 0.14, cooldownMs: 45, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 30,
  },
  footstep_metal: {
    bus: "sfx", assets: A("footsteps", "metal"),
    synth: { kind: "noise_burst", durationMs: 120, lowpass: 7000, decay: 0.9, noise: "white" },
    volume: 0.5, pitchVar: 0.1, cooldownMs: 45, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 34,
  },
  footstep_wood: {
    bus: "sfx", assets: A("footsteps", "wood"),
    synth: { kind: "noise_burst", durationMs: 130, lowpass: 3400, decay: 0.85, noise: "white" },
    volume: 0.48, pitchVar: 0.12, cooldownMs: 45, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 30,
  },
  footstep_sand: {
    bus: "sfx", assets: A("footsteps", "sand"),
    synth: { kind: "noise_burst", durationMs: 160, lowpass: 900, decay: 0.6, noise: "pink" },
    volume: 0.38, pitchVar: 0.14, cooldownMs: 50, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 26,
  },
  footstep_water: {
    bus: "sfx", assets: A("footsteps", "water"),
    synth: { kind: "noise_burst", durationMs: 180, lowpass: 1500, decay: 0.55, noise: "white" },
    volume: 0.44, pitchVar: 0.16, cooldownMs: 50, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 28,
  },
  footstep_gravel: {
    bus: "sfx", assets: A("footsteps", "gravel"),
    synth: { kind: "noise_burst", durationMs: 140, lowpass: 3000, decay: 0.8, noise: "white" },
    volume: 0.48, pitchVar: 0.14, cooldownMs: 45, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 30,
  },
  footstep_dirt: {
    bus: "sfx", assets: A("footsteps", "dirt"),
    synth: { kind: "noise_burst", durationMs: 140, lowpass: 1500, decay: 0.7, noise: "pink" },
    volume: 0.44, pitchVar: 0.14, cooldownMs: 45, maxInstances: 5, priority: 2, refDistance: 1, maxDistance: 28,
  },

  // ── Locomotion foley ───────────────────────────────────────────────────────
  jump: {
    bus: "sfx", assets: A("foley", "jump"),
    synth: { kind: "noise_burst", durationMs: 120, lowpass: 2000, decay: 0.6, noise: "white" },
    volume: 0.4, pitchVar: 0.1, cooldownMs: 120, maxInstances: 3, priority: 3, refDistance: 1, maxDistance: 22,
  },
  land: {
    bus: "sfx", assets: A("foley", "land"),
    synth: { kind: "thump", durationMs: 180, freq: 95, decay: 0.8 },
    volume: 0.55, pitchVar: 0.1, cooldownMs: 120, maxInstances: 3, priority: 3, refDistance: 1, maxDistance: 26,
  },
  cloth: {
    bus: "sfx", assets: A("foley", "cloth"),
    synth: { kind: "noise_burst", durationMs: 90, lowpass: 4000, decay: 0.9, noise: "pink" },
    volume: 0.22, pitchVar: 0.2, cooldownMs: 90, maxInstances: 3, priority: 1, refDistance: 1, maxDistance: 18,
  },

  // ── Player damage / bodies ─────────────────────────────────────────────────
  player_hurt: {
    bus: "voice", positional: false, assets: A("player", "hurt"),
    synth: { kind: "tone_blip", durationMs: 200, freq: 300, freq2: 180, decay: 0.5 },
    volume: 0.6, pitchVar: 0.08, cooldownMs: 250, maxInstances: 2, priority: 7,
  },
  player_death: {
    bus: "voice", positional: false, assets: A("player", "death"),
    synth: { kind: "tone_blip", durationMs: 600, freq: 260, freq2: 110, decay: 0.3 },
    volume: 0.7, cooldownMs: 1000, maxInstances: 1, priority: 8,
  },
  impact_flesh: {
    bus: "sfx", assets: A("impacts", "flesh"),
    synth: { kind: "noise_burst", durationMs: 120, lowpass: 900, decay: 0.7, noise: "pink" },
    volume: 0.5, pitchVar: 0.12, cooldownMs: 60, maxInstances: 6, priority: 5, refDistance: 2, maxDistance: 40,
  },
  body_fall: {
    bus: "sfx", assets: A("impacts", "body_fall"),
    synth: { kind: "thump", durationMs: 260, freq: 80, decay: 0.7 },
    volume: 0.55, pitchVar: 0.1, cooldownMs: 200, maxInstances: 3, priority: 4, refDistance: 2, maxDistance: 40,
  },

  // ── Weapons ────────────────────────────────────────────────────────────────
  gun_pistol_fire: {
    bus: "sfx", assets: A("weapons", "pistol"),
    synth: { kind: "shot", durationMs: 220, freq: 140, lowpass: 4200, decay: 0.9 },
    volume: 0.85, pitchVar: 0.06, cooldownMs: 55, maxInstances: 6, priority: 8, refDistance: 12, maxDistance: 350,
  },
  gun_rifle_fire: {
    bus: "sfx", assets: A("weapons", "rifle"),
    synth: { kind: "shot", durationMs: 180, freq: 150, lowpass: 6000, decay: 0.95 },
    volume: 0.9, pitchVar: 0.05, cooldownMs: 40, maxInstances: 6, priority: 8, refDistance: 14, maxDistance: 400,
  },
  gun_shotgun_fire: {
    bus: "sfx", assets: A("weapons", "shotgun"),
    synth: { kind: "shot", durationMs: 340, freq: 110, lowpass: 2600, decay: 0.8 },
    volume: 0.95, pitchVar: 0.05, cooldownMs: 120, maxInstances: 4, priority: 8, refDistance: 14, maxDistance: 380,
  },
  gun_smg_fire: {
    bus: "sfx", assets: A("weapons", "smg"),
    synth: { kind: "shot", durationMs: 140, freq: 160, lowpass: 5200, decay: 0.95 },
    volume: 0.82, pitchVar: 0.06, cooldownMs: 32, maxInstances: 7, priority: 8, refDistance: 12, maxDistance: 340,
  },
  gun_dry_fire: {
    bus: "sfx", assets: A("weapons", "dry_fire"),
    synth: { kind: "click", durationMs: 40, freq: 2200, decay: 0.95 },
    volume: 0.5, pitchVar: 0.05, cooldownMs: 120, maxInstances: 2, priority: 4, refDistance: 4, maxDistance: 24,
  },
  weapon_reload: {
    bus: "sfx", assets: A("weapons", "reload"),
    synth: { kind: "click", durationMs: 70, freq: 1400, decay: 0.85 },
    volume: 0.55, pitchVar: 0.06, cooldownMs: 120, maxInstances: 3, priority: 5, refDistance: 3, maxDistance: 22,
  },
  shell_casing: {
    bus: "sfx", assets: A("weapons", "casing"),
    synth: { kind: "tone_blip", durationMs: 90, freq: 2600, freq2: 3400, decay: 0.9 },
    volume: 0.3, pitchVar: 0.2, cooldownMs: 40, maxInstances: 6, priority: 2, refDistance: 2, maxDistance: 20,
  },
  explosion: {
    bus: "sfx", assets: A("weapons", "explosion"),
    synth: { kind: "shot", durationMs: 900, freq: 70, lowpass: 1800, decay: 0.5 },
    volume: 1.0, pitchVar: 0.05, cooldownMs: 200, maxInstances: 3, priority: 9, refDistance: 24, maxDistance: 520,
  },

  // ── Bullet impacts (material-aware) ────────────────────────────────────────
  bullet_impact_concrete: {
    bus: "sfx", assets: A("impacts", "concrete"),
    synth: { kind: "noise_burst", durationMs: 110, lowpass: 2600, decay: 0.95, noise: "white" },
    volume: 0.5, pitchVar: 0.14, cooldownMs: 30, maxInstances: 6, priority: 5, refDistance: 3, maxDistance: 60,
  },
  bullet_impact_metal: {
    bus: "sfx", assets: A("impacts", "metal"),
    synth: { kind: "tone_blip", durationMs: 160, freq: 3200, freq2: 1900, decay: 0.85 },
    volume: 0.48, pitchVar: 0.2, cooldownMs: 30, maxInstances: 6, priority: 5, refDistance: 3, maxDistance: 64,
  },
  bullet_impact_wood: {
    bus: "sfx", assets: A("impacts", "wood"),
    synth: { kind: "noise_burst", durationMs: 120, lowpass: 3000, decay: 0.9, noise: "white" },
    volume: 0.46, pitchVar: 0.16, cooldownMs: 30, maxInstances: 6, priority: 5, refDistance: 3, maxDistance: 60,
  },
  bullet_impact_dirt: {
    bus: "sfx", assets: A("impacts", "dirt"),
    synth: { kind: "noise_burst", durationMs: 130, lowpass: 1200, decay: 0.7, noise: "pink" },
    volume: 0.44, pitchVar: 0.16, cooldownMs: 30, maxInstances: 6, priority: 4, refDistance: 3, maxDistance: 56,
  },
  bullet_impact_glass: {
    bus: "sfx", assets: A("impacts", "glass"),
    synth: { kind: "noise_burst", durationMs: 220, lowpass: 9000, decay: 0.85, noise: "white" },
    volume: 0.5, pitchVar: 0.2, cooldownMs: 40, maxInstances: 5, priority: 6, refDistance: 3, maxDistance: 64,
  },
  bullet_impact_flesh: {
    bus: "sfx", assets: A("impacts", "flesh_hit"),
    synth: { kind: "noise_burst", durationMs: 110, lowpass: 800, decay: 0.75, noise: "pink" },
    volume: 0.5, pitchVar: 0.14, cooldownMs: 40, maxInstances: 6, priority: 6, refDistance: 2, maxDistance: 44,
  },

  // ── Vehicles ───────────────────────────────────────────────────────────────
  vehicle_engine: {
    bus: "vehicles", loop: true, assets: A("vehicles", "engine_loop"),
    synth: { kind: "engine", freq: 58, lowpass: 3200 },
    volume: 0.5, priority: 5, refDistance: 6, maxDistance: 180,
  },
  vehicle_horn: {
    bus: "vehicles", assets: A("vehicles", "horn"),
    synth: { kind: "tone_blip", durationMs: 520, freq: 405, freq2: 505, decay: 0.15 },
    volume: 0.7, pitchVar: 0.03, cooldownMs: 200, maxInstances: 3, priority: 6, refDistance: 8, maxDistance: 180,
  },
  vehicle_door_open: {
    bus: "vehicles", assets: A("vehicles", "door_open"),
    synth: { kind: "thump", durationMs: 160, freq: 120, decay: 0.85 },
    volume: 0.45, pitchVar: 0.08, cooldownMs: 200, maxInstances: 3, priority: 3, refDistance: 3, maxDistance: 30,
  },
  vehicle_door_close: {
    bus: "vehicles", assets: A("vehicles", "door_close"),
    synth: { kind: "thump", durationMs: 200, freq: 100, decay: 0.8 },
    volume: 0.55, pitchVar: 0.08, cooldownMs: 200, maxInstances: 3, priority: 3, refDistance: 3, maxDistance: 34,
  },
  tire_screech: {
    bus: "vehicles", assets: A("vehicles", "screech"),
    synth: { kind: "screech", durationMs: 650, freq: 520, lowpass: 3600 },
    volume: 0.5, pitchVar: 0.08, cooldownMs: 120, maxInstances: 4, priority: 6, refDistance: 8, maxDistance: 120,
  },
  vehicle_skid: {
    bus: "vehicles", assets: A("vehicles", "skid"),
    synth: { kind: "screech", durationMs: 950, freq: 420, lowpass: 3000 },
    volume: 0.5, pitchVar: 0.08, cooldownMs: 150, maxInstances: 3, priority: 6, refDistance: 8, maxDistance: 120,
  },
  vehicle_collision_soft: {
    bus: "vehicles", assets: A("vehicles", "collision_soft"),
    synth: { kind: "thump", durationMs: 240, freq: 90, decay: 0.7 },
    volume: 0.6, pitchVar: 0.1, cooldownMs: 90, maxInstances: 4, priority: 6, refDistance: 6, maxDistance: 120,
  },
  vehicle_collision_hard: {
    bus: "vehicles", assets: A("vehicles", "collision_hard"),
    synth: { kind: "shot", durationMs: 360, freq: 80, lowpass: 2200, decay: 0.6 },
    volume: 0.8, pitchVar: 0.08, cooldownMs: 120, maxInstances: 4, priority: 7, refDistance: 8, maxDistance: 160,
  },
  glass_smash: {
    bus: "vehicles", assets: A("vehicles", "glass"),
    synth: { kind: "noise_burst", durationMs: 320, lowpass: 9000, decay: 0.8, noise: "white" },
    volume: 0.55, pitchVar: 0.16, cooldownMs: 120, maxInstances: 4, priority: 5, refDistance: 5, maxDistance: 90,
  },
  vehicle_ignition: {
    bus: "vehicles", assets: A("vehicles", "ignition"),
    synth: { kind: "screech", durationMs: 520, freq: 90, lowpass: 1500 },
    volume: 0.45, pitchVar: 0.05, cooldownMs: 300, maxInstances: 2, priority: 4, refDistance: 5, maxDistance: 60,
  },
  vehicle_shutdown: {
    bus: "vehicles", assets: A("vehicles", "shutdown"),
    synth: { kind: "tone_blip", durationMs: 520, freq: 200, freq2: 80, decay: 0.25 },
    volume: 0.4, pitchVar: 0.05, cooldownMs: 300, maxInstances: 2, priority: 4, refDistance: 5, maxDistance: 60,
  },

  // ── Police / wanted ────────────────────────────────────────────────────────
  siren_wail: {
    bus: "vehicles", loop: true, assets: A("police", "siren_wail"),
    synth: { kind: "siren", freq: 680, freq2: 920, durationMs: 1500 },
    volume: 0.5, priority: 7, refDistance: 10, maxDistance: 260,
  },
  siren_yelp: {
    bus: "vehicles", loop: true, assets: A("police", "siren_yelp"),
    synth: { kind: "siren", freq: 820, freq2: 1150, durationMs: 700 },
    volume: 0.5, priority: 7, refDistance: 10, maxDistance: 260,
  },
  radio_chatter: {
    bus: "vehicles", assets: A("police", "radio_chatter"),
    synth: { kind: "noise_burst", durationMs: 700, lowpass: 1800, decay: 0.5, noise: "white" },
    volume: 0.3, pitchVar: 0.1, cooldownMs: 2000, maxInstances: 2, priority: 3, refDistance: 4, maxDistance: 40,
  },
  wanted_up: {
    bus: "music", positional: false, assets: A("stingers", "wanted_up"),
    synth: { kind: "tone_blip", durationMs: 520, freq: 300, freq2: 620, decay: 0.2 },
    volume: 0.6, cooldownMs: 500, maxInstances: 1, priority: 9,
  },
  wanted_down: {
    bus: "music", positional: false, assets: A("stingers", "wanted_down"),
    synth: { kind: "tone_blip", durationMs: 520, freq: 620, freq2: 300, decay: 0.2 },
    volume: 0.5, cooldownMs: 500, maxInstances: 1, priority: 8,
  },

  // ── Ambience (the city bed lives here) ─────────────────────────────────────
  ambience_city: {
    bus: "ambience", loop: true, positional: false, assets: A("ambience", "city_bed"),
    synth: { kind: "bed", lowpass: 720, noise: "brown", durationMs: 2000 },
    volume: 0.35, priority: 2,
  },
  ambience_wind: {
    bus: "ambience", loop: true, positional: false, assets: A("ambience", "wind"),
    synth: { kind: "wind", lowpass: 1200, noise: "pink", durationMs: 2400 },
    volume: 0.22, priority: 2,
  },
  scatter_distant_horn: {
    bus: "ambience", assets: A("ambience", "distant_horn"),
    synth: { kind: "tone_blip", durationMs: 600, freq: 380, freq2: 460, decay: 0.12 },
    volume: 0.34, pitchVar: 0.1, cooldownMs: 1500, maxInstances: 2, priority: 2, refDistance: 20, maxDistance: 220,
  },
  scatter_dog_bark: {
    bus: "ambience", assets: A("ambience", "dog_bark"),
    synth: { kind: "noise_burst", durationMs: 200, lowpass: 1800, decay: 0.7, noise: "pink" },
    volume: 0.32, pitchVar: 0.18, cooldownMs: 1500, maxInstances: 2, priority: 2, refDistance: 12, maxDistance: 140,
  },
  scatter_distant_siren: {
    bus: "ambience", assets: A("ambience", "distant_siren"),
    synth: { kind: "tone_blip", durationMs: 1200, freq: 640, freq2: 860, decay: 0.06 },
    volume: 0.24, pitchVar: 0.06, cooldownMs: 4000, maxInstances: 1, priority: 2, refDistance: 30, maxDistance: 300,
  },
  scatter_seagull: {
    bus: "ambience", assets: A("ambience", "seagull"),
    synth: { kind: "tone_blip", durationMs: 300, freq: 1800, freq2: 1400, decay: 0.4 },
    volume: 0.26, pitchVar: 0.2, cooldownMs: 2000, maxInstances: 2, priority: 1, refDistance: 20, maxDistance: 200,
  },
  scatter_plane: {
    bus: "ambience", assets: A("ambience", "plane"),
    synth: { kind: "noise_burst", durationMs: 2200, lowpass: 520, decay: 0.25, noise: "brown" },
    volume: 0.2, pitchVar: 0.05, cooldownMs: 8000, maxInstances: 1, priority: 1, refDistance: 40, maxDistance: 320,
  },
  scatter_distant_gunshot: {
    bus: "ambience", assets: A("ambience", "distant_gunshot"),
    synth: { kind: "shot", durationMs: 300, freq: 120, lowpass: 1500, decay: 0.5 },
    volume: 0.3, pitchVar: 0.1, cooldownMs: 3000, maxInstances: 2, priority: 2, refDistance: 30, maxDistance: 320,
  },

  // ── UI / mission / economy / phone ─────────────────────────────────────────
  ui_click: {
    bus: "ui", positional: false, assets: A("ui", "click"),
    synth: { kind: "tone_blip", durationMs: 60, freq: 900, decay: 0.9 },
    volume: 0.5, cooldownMs: 30, maxInstances: 4, priority: 3,
  },
  ui_hover: {
    bus: "ui", positional: false, assets: A("ui", "hover"),
    synth: { kind: "tone_blip", durationMs: 40, freq: 1200, decay: 0.95 },
    volume: 0.32, cooldownMs: 30, maxInstances: 4, priority: 2,
  },
  ui_confirm: {
    bus: "ui", positional: false, assets: A("ui", "confirm"),
    synth: { kind: "tone_blip", durationMs: 160, freq: 700, freq2: 1050, decay: 0.5 },
    volume: 0.5, cooldownMs: 60, maxInstances: 3, priority: 3,
  },
  ui_cancel: {
    bus: "ui", positional: false, assets: A("ui", "cancel"),
    synth: { kind: "tone_blip", durationMs: 160, freq: 520, freq2: 340, decay: 0.5 },
    volume: 0.5, cooldownMs: 60, maxInstances: 3, priority: 3,
  },
  ui_error: {
    bus: "ui", positional: false, assets: A("ui", "error"),
    synth: { kind: "tone_blip", durationMs: 260, freq: 200, freq2: 170, decay: 0.3 },
    volume: 0.5, cooldownMs: 120, maxInstances: 2, priority: 3,
  },
  ui_open: {
    bus: "ui", positional: false, assets: A("ui", "open"),
    synth: { kind: "tone_blip", durationMs: 140, freq: 600, freq2: 900, decay: 0.5 },
    volume: 0.45, cooldownMs: 60, maxInstances: 2, priority: 3,
  },
  ui_close: {
    bus: "ui", positional: false, assets: A("ui", "close"),
    synth: { kind: "tone_blip", durationMs: 140, freq: 900, freq2: 600, decay: 0.5 },
    volume: 0.45, cooldownMs: 60, maxInstances: 2, priority: 3,
  },
  notification: {
    bus: "ui", positional: false, assets: A("ui", "notification"),
    synth: { kind: "tone_blip", durationMs: 240, freq: 880, freq2: 1320, decay: 0.35 },
    volume: 0.5, cooldownMs: 200, maxInstances: 2, priority: 4,
  },
  map_ping: {
    bus: "ui", positional: false, assets: A("ui", "map_ping"),
    synth: { kind: "tone_blip", durationMs: 120, freq: 1500, decay: 0.6 },
    volume: 0.4, cooldownMs: 100, maxInstances: 2, priority: 3,
  },
  checkpoint: {
    bus: "ui", positional: false, assets: A("ui", "checkpoint"),
    synth: { kind: "tone_blip", durationMs: 320, freq: 700, freq2: 1400, decay: 0.3 },
    volume: 0.55, cooldownMs: 300, maxInstances: 2, priority: 5,
  },
  mission_start: {
    bus: "music", positional: false, assets: A("stingers", "mission_start"),
    synth: { kind: "tone_blip", durationMs: 420, freq: 520, freq2: 780, decay: 0.2 },
    volume: 0.6, cooldownMs: 500, maxInstances: 1, priority: 6,
  },
  mission_complete: {
    bus: "music", positional: false, assets: A("stingers", "mission_complete"),
    synth: { kind: "tone_blip", durationMs: 520, freq: 780, freq2: 1170, decay: 0.2 },
    volume: 0.65, cooldownMs: 500, maxInstances: 1, priority: 6,
  },
  mission_failed: {
    bus: "music", positional: false, assets: A("stingers", "mission_failed"),
    synth: { kind: "tone_blip", durationMs: 620, freq: 420, freq2: 200, decay: 0.18 },
    volume: 0.6, cooldownMs: 500, maxInstances: 1, priority: 6,
  },
  cash_pickup: {
    bus: "ui", positional: false, assets: A("ui", "cash"),
    synth: { kind: "tone_blip", durationMs: 180, freq: 1200, freq2: 1600, decay: 0.5 },
    volume: 0.5, cooldownMs: 60, maxInstances: 3, priority: 4,
  },
  ammo_pickup: {
    bus: "ui", positional: false, assets: A("ui", "ammo"),
    synth: { kind: "tone_blip", durationMs: 120, freq: 600, decay: 0.7 },
    volume: 0.45, cooldownMs: 80, maxInstances: 3, priority: 3,
  },
  health_pickup: {
    bus: "ui", positional: false, assets: A("ui", "health"),
    synth: { kind: "tone_blip", durationMs: 200, freq: 700, freq2: 1050, decay: 0.4 },
    volume: 0.5, cooldownMs: 120, maxInstances: 2, priority: 4,
  },
  phone_ring: {
    bus: "ui", positional: false, assets: A("ui", "phone_ring"),
    synth: { kind: "tone_blip", durationMs: 420, freq: 900, freq2: 1100, decay: 0.2 },
    volume: 0.5, cooldownMs: 800, maxInstances: 1, priority: 5,
  },
  phone_tap: {
    bus: "ui", positional: false, assets: A("ui", "phone_tap"),
    synth: { kind: "click", durationMs: 40, freq: 1600, decay: 0.95 },
    volume: 0.4, cooldownMs: 30, maxInstances: 4, priority: 2,
  },
  ability_ready: {
    bus: "music", positional: false, assets: A("stingers", "ability_ready"),
    synth: { kind: "tone_blip", durationMs: 300, freq: 500, freq2: 1000, decay: 0.3 },
    volume: 0.55, cooldownMs: 500, maxInstances: 1, priority: 5,
  },
} satisfies Record<string, ClipDef>;

/** The union of every sound event id — derived from the catalog (single source of truth). */
export type SoundEventId = keyof typeof CATALOG;

/** Declarative looping-emitter spec stored on an entity's `sfx_emitter` component. */
export interface SfxEmitterSpec {
  /** Which looping catalog sound to play (e.g. `"vehicle_engine"`, `"siren_wail"`). */
  event: SoundEventId;
  /** Gain multiplier 0..1 (default 1). */
  gain?: number;
  /** Set false to silence without removing the component (default true). */
  enabled?: boolean;
}
