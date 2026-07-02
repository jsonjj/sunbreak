// Backend service locator. The SFX catalog plays through whatever `SfxBackend` is active:
//  1. an engine-provided backend registered via `setSfxBackend()` (preferred), OR
//  2. one auto-discovered on `globalThis.__SUNBREAK_AUDIO_BACKEND__` (the `audio/engine`
//     subsystem or the integrator can publish there), OR
//  3. the built-in `WebAudioBackend` fallback (so we always work standalone).
//
// A monotonically-increasing `epoch` lets loop-owning systems (ambience, engine, emitters)
// notice a backend swap and rebuild their persistent voices on the new backend.

import type { SfxBackend } from "./types";
import { WebAudioBackend } from "./backend";

declare global {
  // eslint-disable-next-line no-var
  var __SUNBREAK_AUDIO_BACKEND__: SfxBackend | undefined;
}

let active: SfxBackend | null = null;
let epoch = 0;
const changeListeners = new Set<() => void>();

function discoverEngineBackend(): SfxBackend | null {
  const g = globalThis as typeof globalThis & { __SUNBREAK_AUDIO_BACKEND__?: SfxBackend };
  const c = g.__SUNBREAK_AUDIO_BACKEND__;
  return c && typeof c.play === "function" && c.kind === "engine" ? c : null;
}

/** The active backend, adopting a late-registered engine backend if one appears. */
export function getBackend(): SfxBackend {
  if (!active || active.kind === "fallback") {
    const engine = discoverEngineBackend();
    if (engine && engine !== active) setSfxBackend(engine);
  }
  if (!active) active = new WebAudioBackend();
  return active;
}

/** Inject the audio-engine backend (integrator seam). Disposes a fallback we created. */
export function setSfxBackend(backend: SfxBackend | null): void {
  if (backend === active) return;
  const previous = active;
  active = backend;
  epoch++;
  if (previous && previous.kind === "fallback") previous.dispose();
  for (const listener of changeListeners) listener();
}

/** Bumps whenever the backend changes; loop systems compare against it to rebuild voices. */
export function backendEpoch(): number {
  return epoch;
}

export function onBackendChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Resume the AudioContext (autoplay policy). Safe to call repeatedly. */
export function resumeAudio(): void {
  getBackend().resume();
}

/** Attach unlock handlers so the context resumes on user gestures (autoplay policy). */
export function primeAudioOnGesture(): () => void {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "keydown", "touchstart"];
  const opts: AddEventListenerOptions = { passive: true };
  const handler: EventListener = () => resumeAudio();
  for (const e of events) window.addEventListener(e, handler, opts);
  return () => {
    for (const e of events) window.removeEventListener(e, handler, opts);
  };
}
