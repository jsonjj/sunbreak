// Core types for the SUNBREAK sound-design / SFX subsystem (`audio/sound`).
//
// This subsystem is the game-event -> sound *catalog + dispatcher*. It does NOT own the
// low-level Web Audio graph — that belongs to the `audio/engine` subsystem. We consume a
// small, decoupled `SfxBackend` contract (below) so the integrator can point us at the real
// engine, while a built-in Web Audio fallback keeps us fully functional standalone.

import type { Vec3 } from "@sunbreak/shared";

/** Mixer buses SFX are routed through. Mirrors the engine's category buses. */
export type SfxBus = "sfx" | "vehicles" | "ambience" | "ui" | "music" | "voice";

export const SFX_BUSES: readonly SfxBus[] = [
  "sfx",
  "vehicles",
  "ambience",
  "ui",
  "music",
  "voice",
] as const;

/** Ground/hit materials that pick footstep + impact variants. */
export type SfxSurface =
  | "concrete"
  | "grass"
  | "metal"
  | "wood"
  | "sand"
  | "water"
  | "gravel"
  | "dirt";

// ─────────────────────────────────────────────────────────────────────────────
// Procedural synthesis — CC0-by-construction placeholder voices
// ─────────────────────────────────────────────────────────────────────────────
// Every catalog entry ships with a `synth` spec so the subsystem is audible with ZERO
// binary assets (nothing to license, nothing to download). When real CC0 files are dropped
// into `client/public/audio/...` the backend decodes + prefers them automatically.

export type SynthKind =
  | "noise_burst" // filtered noise blip — footsteps, foley, impacts
  | "tone_blip" // short (optionally two-note) sine — UI, pickups, stingers
  | "thump" // low body-thump — collisions, lands, doors
  | "click" // very short transient — dry-fire, reload clacks
  | "shot" // noise + sub transient — gunfire, explosions
  | "engine" // continuous harmonic loop — vehicle engine bed
  | "bed" // continuous filtered noise loop — city ambience
  | "wind" // continuous modulated noise loop — wind
  | "screech" // sustained bandpassed noise — tire screech/skid
  | "siren"; // continuous two-tone loop — police siren

export interface SynthSpec {
  kind: SynthKind;
  durationMs?: number;
  /** Primary frequency (Hz) for tonal kinds. */
  freq?: number;
  /** Secondary frequency (Hz) — second note for `tone_blip`, off-tone for `siren`. */
  freq2?: number;
  /** Decay shaping 0..1 (higher = snappier). */
  decay?: number;
  /** Lowpass cutoff (Hz) applied at the node for extra shaping. */
  lowpass?: number;
  /** Noise colour for noise-based kinds. */
  noise?: "white" | "pink" | "brown";
  /** Intrinsic gain trim baked into the buffer (0..1). */
  gain?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog entry — the data-driven "sound design" for one game event
// ─────────────────────────────────────────────────────────────────────────────

export interface ClipDef {
  /** Mixer bus. */
  bus: SfxBus;
  /** CC0 asset URLs (public path), tried in order; first that decodes wins. Optional — the
   *  synth fallback plays until (or unless) an asset is available. */
  assets?: string[];
  /** Procedural fallback voice (recommended for every entry). */
  synth?: SynthSpec;
  /** Base gain 0..1 (default 1). */
  volume?: number;
  /** Random pitch jitter as a +/- fraction (e.g. 0.06 = +/-6%). */
  pitchVar?: number;
  /** 3D positional vs 2D. Defaults to the bus default. */
  positional?: boolean;
  /** Looping emitter (ambience bed, engine, siren). */
  loop?: boolean;
  /** Minimum gap between plays of THIS id (ms). */
  cooldownMs?: number;
  /** Max concurrent voices for THIS id. */
  maxInstances?: number;
  /** Priority 0..10 for global voice stealing. Defaults to the bus default. */
  priority?: number;
  /** PannerNode ref distance (m). Defaults to the bus default. */
  refDistance?: number;
  /** PannerNode max distance (m). Defaults to the bus default. */
  maxDistance?: number;
  /** PannerNode rolloff factor. Defaults to the bus default. */
  rolloff?: number;
}

/** Per-play overrides passed to `playEvent` / emitted on the bus. */
export interface PlayOptions {
  position?: Vec3;
  /** Extra gain multiplier (0..1+). */
  gain?: number;
  /** Extra playback-rate multiplier (pitch). */
  rate?: number;
  /** Priority override. */
  priority?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend contract — what we need from the audio engine (or the fallback)
// ─────────────────────────────────────────────────────────────────────────────

/** A fully-resolved playback instruction handed to the backend. */
export interface PlayRequest {
  /** Candidate asset URLs (first decoded one is used). */
  urls?: string[];
  /** Procedural fallback voice. */
  synth?: SynthSpec;
  bus: SfxBus;
  gain: number;
  rate: number;
  loop: boolean;
  positional: boolean;
  position?: Vec3;
  refDistance: number;
  maxDistance: number;
  rolloff: number;
  priority: number;
  /** Optional initial lowpass cutoff (Hz) — used by engine/occlusion shaping. */
  lowpassHz?: number;
}

/** A live voice returned by the backend. One-shots auto-release; loops are caller-owned. */
export interface VoiceHandle {
  readonly id: number;
  readonly active: boolean;
  stop(fadeMs?: number): void;
  setGain(gain: number, timeConstant?: number): void;
  setRate(rate: number, timeConstant?: number): void;
  setPosition(pos: Vec3): void;
  setLowpass(hz: number, timeConstant?: number): void;
}

/**
 * The minimal audio-engine surface the SFX catalog consumes. The real `audio/engine`
 * subsystem can implement this directly (or the integrator can adapt its API to it) and
 * register it via `setSfxBackend()` / the `__SUNBREAK_AUDIO_BACKEND__` global. Until then
 * the built-in `WebAudioBackend` fallback satisfies it.
 */
export interface SfxBackend {
  readonly kind: "engine" | "fallback";
  /** True once the AudioContext is unlocked + running. */
  readonly running: boolean;
  /** Resume the context after a user gesture (autoplay policy). Safe to call repeatedly. */
  resume(): void;
  /** Fire a voice. Returns null if dropped (over budget / not yet playable). */
  play(req: PlayRequest): VoiceHandle | null;
  setBusVolume(bus: SfxBus, volume: number, timeConstant?: number): void;
  setMasterVolume(volume: number, timeConstant?: number): void;
  /** Ramp a bus toward `to` (ducking snapshots). */
  duck(bus: SfxBus, to: number, timeConstant?: number): void;
  /** Update the listener pose (fallback only; the engine drives its own from the camera). */
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void;
  activeVoices(): number;
  dispose(): void;
}
