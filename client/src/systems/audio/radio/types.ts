// Radio & Music — shared type surface for the SUNBREAK in-car radio subsystem.
// Owned by `client/src/systems/audio/radio/`. Pure, serializable data shapes only
// (station configs are data-driven; playback lives in RadioEngine).

/** What kind of thing a broadcast element is. Drives clock scheduling + ducking. */
export type RadioCategory = "song" | "djLink" | "ad" | "ident" | "sweeper" | "news";

/** A single playable item on a station (a track, DJ link, ad, ident, sweeper, …). */
export interface RadioElement {
  /** Stable id, unique within its station+category (used for no-repeat + logging). */
  id: string;
  category: RadioCategory;
  /** Same-origin URL under `client/public/` (asset pipeline drops the CC0/CC file here). */
  src: string;
  /** Length in seconds. Best-effort; the live clock + crossfader tolerate small drift. */
  durationSec: number;
  title?: string;
  artist?: string;
  license?: "CC0" | "CC-BY" | "CC-BY-SA";
  /** Human-readable credit; required for CC-BY / CC-BY-SA (surfaced in a credits screen). */
  attribution?: string;
  /** Contextual selectors, e.g. ["night"], ["hurricane"] — reserved for v3 programming. */
  tags?: string[];
}

/** The repeating "format" of a station: how categories are interleaved into a broadcast. */
export interface StationClock {
  /** e.g. ["song","song","djLink","song","ad","ident"] — expanded into a full cycle. */
  pattern: RadioCategory[];
  /** Avoid replaying the last N picks from a pool (default 3). */
  noRepeatWindow?: number;
  /** Equal-power crossfade length between elements, seconds (default 2.5). */
  crossfadeSec?: number;
}

/** A complete, data-driven station definition. Everything the programmer needs. */
export interface StationDef {
  id: string;
  name: string;
  genre: string;
  /** Accent color for HUD / station wheel (e.g. "#ff8a3d"). */
  colorHex: string;
  /** Deterministic seed → the same broadcast order for everyone tuned in. */
  seed: number;
  /** DJ persona + TTS steer (consumed by the v3 offline VO pipeline; inert at runtime). */
  dj: { persona: string; voice: string; instructions: string };
  clock: StationClock;
  songs: RadioElement[];
  idents: RadioElement[];
  djLinks: RadioElement[];
  ads: RadioElement[];
  sweepers: RadioElement[];
  news?: RadioElement[];
}

/** High-level playback state surfaced to the HUD/store. */
export type RadioStatus = "off" | "loading" | "playing" | "offair";

/** Result of resolving the live clock at a wall-clock instant. */
export interface NowPlaying {
  stationId: string;
  stationName: string;
  colorHex: string;
  elementId: string;
  category: RadioCategory;
  title?: string;
  artist?: string;
  /** Index into the expanded broadcast cycle. */
  index: number;
  /** Seconds into the current element (where a fresh tune-in should seek to). */
  offsetSec: number;
  durationSec: number;
  /** performance.now()-based timestamp of when this element (locally) started. */
  startedAtMs: number;
}

/**
 * The minimal slice of the AUDIO ENGINE's shared API that radio needs for playback.
 * Radio never owns the master mixer — it connects its 2-deck crossfader into whatever
 * shared graph the audio engine provides (injected via `setRadioAudioBackend`), falling
 * back to the shared Howler context, then to a private context. See `audioBridge.ts`.
 */
export interface RadioAudioBackend {
  /** The single, shared AudioContext for the whole app. */
  readonly context: AudioContext;
  /** Node the radio bus connects into (engine radio bus, Howler master, or ctx.destination). */
  readonly destination: AudioNode;
  /** 0..1 effective category gain the engine wants applied to radio. Omit → radio derives it. */
  getBaseGain?: () => number;
  /** Subscribe to base-gain changes; returns an unsubscribe fn. */
  onBaseGainChange?: (cb: () => void) => () => void;
  /** Optional engine-driven duck multiplier 0..1 (1 = no duck). */
  getDuckGain?: () => number;
  /** Resume/unlock the shared context on a user gesture. */
  resume?: () => void | Promise<void>;
  /** Short label for diagnostics ("engine" | "howler" | "standalone"). */
  readonly source: string;
}

/** Per-entity tuning state mirrored into the ECS (see `radio.components.ts`). */
export interface RadioReceiver {
  /** Whether this receiver wants to be on (subject to in-vehicle gating). */
  power: boolean;
  /** Currently tuned station id, or null when off. */
  stationId: string | null;
  /** 0..1 local trim applied on top of the engine's radio volume. */
  volume: number;
  /** True when the signal should be muffled (e.g. heard from outside / engine idling). */
  muffled?: boolean;
}
