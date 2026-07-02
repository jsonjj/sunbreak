// Audio bridge — how the radio subsystem obtains the AUDIO ENGINE's shared playback API without
// importing the engine's folder (WAVE-2 file ownership). Resolution order:
//
//   1. An injected backend  — `setRadioAudioBackend()` is the integration seam the audio engine
//      (or integrator) calls to hand radio its dedicated, mixer-governed radio bus. PREFERRED.
//   2. `globalThis.__SUNBREAK_AUDIO__` — an optional handshake the engine may publish at boot.
//   3. The shared **Howler** context — the audio engine is Howler-based, so `Howler.ctx` /
//      `Howler.masterGain` IS the engine's live graph. Connecting here shares one AudioContext
//      (the spec's hard rule: never run two contexts) and flows through the master gain.
//   4. A private `AudioContext` — last-resort standalone fallback so radio still works solo.
//
// Non-engine backends derive their base gain from the shared settings store (master × music).
import { Howler } from "howler";
import { useSettingsStore } from "@/stores/settings.store";
import type { RadioAudioBackend } from "./types";

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Optional handshake shape an audio engine may expose on `globalThis.__SUNBREAK_AUDIO__`. */
interface EngineAudioGlobal {
  context?: AudioContext;
  /** Node to connect the radio bus into (already governed by the engine's mixer/duck). */
  radioBus?: AudioNode;
  getRadioGain?: () => number;
  onRadioGainChange?: (cb: () => void) => () => void;
  getDuckGain?: () => number;
  resume?: () => void | Promise<void>;
}

let injected: RadioAudioBackend | null = null;
let resolved: RadioAudioBackend | null = null;
const changeListeners = new Set<() => void>();

/** Integration seam: the audio engine / integrator injects its shared radio backend here. */
export function setRadioAudioBackend(backend: RadioAudioBackend | null): void {
  injected = backend;
  resolved = backend ?? null;
  for (const cb of changeListeners) cb();
}

/** Subscribe to backend swaps (so a live RadioEngine can rebuild its graph). */
export function subscribeBackend(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

function settingsBaseGain(): number {
  const a = useSettingsStore.getState().audio;
  // Radio is music-like; ride the master × music sliders until the engine mixer owns it.
  return clamp01(a.master) * clamp01(a.music);
}

function onSettingsChange(cb: () => void): () => void {
  return useSettingsStore.subscribe(cb);
}

function fromEngineGlobal(): RadioAudioBackend | null {
  const g = (globalThis as { __SUNBREAK_AUDIO__?: EngineAudioGlobal }).__SUNBREAK_AUDIO__;
  if (!g?.context) return null;
  const ctx = g.context;
  return {
    context: ctx,
    destination: g.radioBus ?? ctx.destination,
    getBaseGain: g.getRadioGain,
    onBaseGainChange: g.onRadioGainChange,
    getDuckGain: g.getDuckGain,
    resume: g.resume ?? (() => ctx.resume()),
    source: "engine",
  };
}

function fromHowler(): RadioAudioBackend | null {
  try {
    const H = Howler as unknown as {
      ctx?: AudioContext;
      masterGain?: GainNode;
      usingWebAudio?: boolean;
    };
    if (!H?.usingWebAudio || !H.ctx) return null;
    const ctx = H.ctx;
    return {
      context: ctx,
      destination: H.masterGain ?? ctx.destination,
      getBaseGain: settingsBaseGain,
      onBaseGainChange: onSettingsChange,
      resume: () => ctx.resume(),
      source: "howler",
    };
  } catch {
    return null;
  }
}

function fromStandalone(): RadioAudioBackend | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  return {
    context: ctx,
    destination: ctx.destination,
    getBaseGain: settingsBaseGain,
    onBaseGainChange: onSettingsChange,
    resume: () => ctx.resume(),
    source: "standalone",
  };
}

/**
 * Resolve (and cache) the best available audio backend. Returns null only if the browser has no
 * Web Audio support at all. Cached so we never spin up a second AudioContext.
 */
export function resolveRadioBackend(): RadioAudioBackend | null {
  if (resolved) return resolved;
  resolved = injected ?? fromEngineGlobal() ?? fromHowler() ?? fromStandalone();
  return resolved;
}

export function currentBackend(): RadioAudioBackend | null {
  return resolved;
}

/** Drop the cached backend (e.g. on full teardown) so the next resolve re-picks. */
export function resetRadioBackend(): void {
  resolved = injected;
}

/**
 * When sharing Howler's context, its `autoSuspend` will pause the ctx after ~30s of no Howler
 * sounds — which would silence our MediaElement-sourced radio. Hold it awake while powered and
 * restore engine behavior when off. No-op for the injected/engine backend (engine owns policy).
 */
export function holdContextAwake(backend: RadioAudioBackend, powered: boolean): void {
  if (backend.source !== "howler") return;
  try {
    (Howler as unknown as { autoSuspend: boolean }).autoSuspend = !powered;
  } catch {
    /* ignore — older Howler builds */
  }
}
