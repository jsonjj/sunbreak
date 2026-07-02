// Streaming buses for music/radio. Unlike SFX these are NOT decoded into RAM — they stream via
// HTML5 audio (`html5: true`), so long tracks/stations stay cheap. The Radio subsystem drives
// these (one active station at a time); Dialogue ducks them via the mixer. They are 2D by design.
import { Howl } from "howler";
import { effVol, useMixer } from "../mixer/mixerStore";
import type { Category } from "../mixer/categories";

export interface StreamOptions {
  src: string | string[];
  /** 'music' or 'radio' (default 'music'). */
  category?: Category;
  /** Base gain (0..1) before category/master. */
  volume?: number;
  loop?: boolean;
  /** Fade-in duration (ms). */
  fadeMs?: number;
  /** Force HTML5 streaming (default true). */
  html5?: boolean;
  /** Explicit codec hint for extensionless stream URLs. */
  format?: string | string[];
}

export interface StreamHandle {
  readonly id: number;
  readonly category: Category;
  readonly howl: Howl;
  readonly soundId: number;
  readonly base: number;
  setVolume(base: number, ms?: number): void;
  pause(): void;
  play(): void;
  stop(fadeMs?: number): void;
}

interface StreamInternal extends StreamHandle {
  _reapply(): void;
}

let seq = 0;
let subscribed = false;
const streams = new Set<StreamInternal>();

/** Start a streaming track/station. Fades in from silence. */
export function playStream(opts: StreamOptions): StreamHandle {
  const category = opts.category ?? "music";
  const src = typeof opts.src === "string" ? [opts.src] : opts.src;
  const howl = new Howl({
    src,
    html5: opts.html5 ?? true,
    loop: opts.loop ?? category === "music",
    format: opts.format,
    volume: 0,
  });
  const soundId = howl.play();
  const state = { base: opts.volume ?? 1, applied: 0 };
  const target = effVol(category, state.base);
  const fade = opts.fadeMs ?? 400;
  if (fade > 0) howl.fade(0, target, fade, soundId);
  else howl.volume(target, soundId);
  state.applied = target;

  const handle: StreamInternal = {
    id: ++seq,
    category,
    howl,
    soundId,
    get base() {
      return state.base;
    },
    setVolume(newBase, ms = 150) {
      state.base = newBase;
      const t = effVol(category, newBase);
      if (ms > 0) howl.fade(state.applied, t, ms, soundId);
      else howl.volume(t, soundId);
      state.applied = t;
    },
    _reapply() {
      const t = effVol(category, state.base);
      if (Math.abs(t - state.applied) < 1e-4) return;
      howl.fade(state.applied, t, 60, soundId);
      state.applied = t;
    },
    pause() {
      howl.pause(soundId);
    },
    play() {
      howl.play(soundId);
    },
    stop(fadeMs = 300) {
      if (!streams.has(handle)) return;
      streams.delete(handle);
      if (fadeMs > 0) {
        howl.once(
          "fade",
          () => {
            howl.stop(soundId);
            howl.unload();
          },
          soundId,
        );
        howl.fade(state.applied, 0, fadeMs, soundId);
      } else {
        howl.stop(soundId);
        howl.unload();
      }
    },
  };
  streams.add(handle);
  return handle;
}

/** Crossfade: fade out `from` (if any) and start a new stream faded in. Returns the new handle. */
export function crossfadeStream(
  from: StreamHandle | null,
  opts: StreamOptions,
  ms = 600,
): StreamHandle {
  from?.stop(ms);
  return playStream({ ...opts, fadeMs: ms });
}

/** Re-apply effective volume to all streams (called on mixer/duck changes). */
export function reapplyStreamVolumes(): void {
  for (const s of streams) s._reapply();
}

export function stopAllStreams(fadeMs = 200): void {
  for (const s of [...streams]) s.stop(fadeMs);
}

export function activeStreamCount(): number {
  return streams.size;
}

/** Subscribe the stream bus to mixer changes. Idempotent. */
export function initStreamBus(): void {
  if (subscribed) return;
  subscribed = true;
  useMixer.subscribe(() => reapplyStreamVolumes());
}
