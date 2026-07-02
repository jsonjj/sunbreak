// Engine boot: initialize Howler (WebAudio), auto-unlock on first gesture, and expose the quality
// tier that drives the global voice budget. (Master volume is applied per-voice by the mixer.)
//
// NOTE: this project ships Howler v2 (`howler@^2.2.4` + `@types/howler`), which has spatial
// audio BUILT IN — there is no `howler/plugins/spatial` import (that is Howler v3 only). We use
// the v2 API: `Howler.pos/orientation` for the listener and `Howl.pos/pannerAttr` per voice.
import { Howler } from "howler";
import type { QualityTier } from "@sunbreak/shared";

/** Global concurrent-voice budget per quality tier (HRTF panners are the CPU limiter). */
export const VOICE_CAP_BY_TIER: Record<QualityTier, number> = {
  low: 16,
  medium: 32,
  high: 48,
};

/** Default panning model per tier (low tiers avoid expensive HRTF entirely). */
export const DEFAULT_PANNING_BY_TIER: Record<QualityTier, "HRTF" | "equalpower"> = {
  low: "equalpower",
  medium: "equalpower",
  high: "HRTF",
};

let booted = false;
let quality: QualityTier = "high";
let removeGestureListeners: (() => void) | null = null;
const unlockListeners = new Set<() => void>();

/** True once the AudioContext is running (i.e. the user gesture has unlocked audio). */
export function isAudioUnlocked(): boolean {
  const ctx = Howler.ctx;
  return !!ctx && ctx.state === "running";
}

/** Resume the AudioContext (call from a user gesture). Safe to call repeatedly. */
export function initAudio(): Promise<void> {
  const ctx = Howler.ctx;
  if (!ctx) return Promise.resolve();
  if (ctx.state === "running") {
    notifyUnlock();
    return Promise.resolve();
  }
  return ctx
    .resume()
    .then(() => notifyUnlock())
    .catch(() => {
      /* another gesture will retry */
    });
}

/** Subscribe to the one-time "audio unlocked" event (e.g. to dismiss an overlay). */
export function onAudioUnlock(cb: () => void): () => void {
  if (isAudioUnlocked()) {
    cb();
    return () => {};
  }
  unlockListeners.add(cb);
  return () => unlockListeners.delete(cb);
}

function notifyUnlock(): void {
  if (unlockListeners.size === 0) return;
  for (const cb of [...unlockListeners]) {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  }
  unlockListeners.clear();
  removeGestureListeners?.();
  removeGestureListeners = null;
}

function installGestureUnlock(): void {
  if (typeof window === "undefined" || removeGestureListeners) return;
  const onGesture = (): void => {
    void initAudio();
  };
  const opts: AddEventListenerOptions = { passive: true };
  const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "click"];
  for (const ev of events) window.addEventListener(ev, onGesture, opts);
  removeGestureListeners = () => {
    for (const ev of events) window.removeEventListener(ev, onGesture, opts);
  };
}

/**
 * Boot the audio engine. Idempotent. Sets Howler global flags, syncs the master volume, and
 * installs a first-gesture unlock handler (in addition to Howler's own `autoUnlock`).
 */
export function bootAudio(): void {
  if (booted) return;
  booted = true;
  Howler.autoUnlock = true; // resume ctx on the first user gesture
  Howler.autoSuspend = true; // suspend ctx while idle/blurred -> saves CPU
  // We intentionally leave Howler's GLOBAL gain at 1: master is applied per-voice via the mixer's
  // effVol() so it composes cleanly with per-category volume, mute/solo and ducking (applying it
  // here too would square the master term).
  installGestureUnlock();
}

/**
 * Set the raw Howler global gain (0..1). NOT used by the mixer (which applies master per-voice);
 * exposed only for special cases like a hard global fade-out.
 */
export function setHowlerGlobalGain(v: number): void {
  Howler.volume(clamp01(v));
}

export function getQualityTier(): QualityTier {
  return quality;
}

/** Set the quality tier -> updates the global voice budget consumed by the VoiceManager. */
export function setQualityTier(tier: QualityTier): void {
  quality = tier;
}

/** Global concurrent-voice cap for the current quality tier. */
export function getVoiceCap(): number {
  return VOICE_CAP_BY_TIER[quality];
}

/** Default panning model for the current tier (used when an asset/category leaves it unset). */
export function getDefaultPanningModel(): "HRTF" | "equalpower" {
  return DEFAULT_PANNING_BY_TIER[quality];
}

/** True when Howler resolved to the WebAudio backend (required for spatial panning). */
export function usingWebAudio(): boolean {
  return Howler.usingWebAudio;
}

/**
 * Play a short synthesized beep straight on the WebAudio graph — no asset needed. Handy for the
 * v0 "click to enable sound" smoke test and as a UI fallback when no ui asset is registered.
 */
export function playBeep(frequency = 880, durationMs = 120, gain = 0.15): void {
  const ctx = Howler.ctx;
  if (!ctx || ctx.state !== "running") return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = "sine";
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(amp).connect(Howler.masterGain ?? ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
