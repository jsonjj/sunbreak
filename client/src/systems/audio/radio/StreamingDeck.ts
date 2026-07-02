// A single streaming "deck": an <audio> element streamed through a MediaElementAudioSourceNode +
// per-deck GainNode so the crossfader can equal-power blend two decks. We STREAM (never
// decodeAudioData) long tracks so memory stays flat regardless of track length (spec rule).
//
// If Web Audio graph routing is unavailable, the deck degrades to element-only mode (hard-cut
// via `el.volume`) so radio still plays.

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export class StreamingDeck {
  readonly el: HTMLAudioElement;
  private readonly ctx: AudioContext;
  private readonly gain: GainNode | null;
  private node: MediaElementAudioSourceNode | null = null;
  /** Bumped on every cue/stop so a stale async `cue` resolves as cancelled. */
  private cueToken = 0;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.el = new Audio();
    this.el.preload = "auto";
    this.el.crossOrigin = "anonymous";
    this.el.loop = false;
    this.el.autoplay = false;

    let gain: GainNode | null = null;
    try {
      this.node = ctx.createMediaElementSource(this.el);
      gain = ctx.createGain();
      gain.gain.value = 0;
      this.node.connect(gain).connect(out);
    } catch {
      // Element-only fallback (no Web Audio graph on this deck).
      this.node = null;
      gain = null;
      this.el.volume = 0;
    }
    this.gain = gain;
  }

  /** True when routed through Web Audio (enables real gain-curve crossfades). */
  get graphMode(): boolean {
    return this.gain != null;
  }

  get currentTime(): number {
    return this.el.currentTime || 0;
  }

  /** Reported duration, or 0 while unknown (caller falls back to the config duration). */
  get duration(): number {
    const d = this.el.duration;
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  get paused(): boolean {
    return this.el.paused;
  }

  /**
   * Load `src` and seek to `offsetSec`. Resolves `true` when ready-to-play, `false` on
   * error/timeout or if superseded by a newer cue. Never rejects.
   */
  cue(src: string, offsetSec = 0, timeoutMs = 9000): Promise<boolean> {
    const token = ++this.cueToken;
    const el = this.el;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const cleanup = () => {
        el.removeEventListener("canplay", onReady);
        el.removeEventListener("canplaythrough", onReady);
        el.removeEventListener("error", onErr);
        clearTimeout(timer);
      };
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(token === this.cueToken ? ok : false);
      };
      const onReady = () => {
        if (token !== this.cueToken) return finish(false);
        try {
          const dur = el.duration;
          if (offsetSec > 0 && (!Number.isFinite(dur) || offsetSec < dur)) {
            el.currentTime = offsetSec;
          }
        } catch {
          /* seeking not ready yet; playback still starts near 0 */
        }
        finish(true);
      };
      const onErr = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);
      el.addEventListener("canplay", onReady, { once: true });
      el.addEventListener("canplaythrough", onReady, { once: true });
      el.addEventListener("error", onErr, { once: true });
      try {
        el.src = src;
        el.load();
      } catch {
        finish(false);
      }
    });
  }

  play(): void {
    const p = this.el.play();
    if (p && typeof p.catch === "function") p.catch(() => void 0); // autoplay gate; retried on resume
  }

  pause(): void {
    try {
      this.el.pause();
    } catch {
      /* ignore */
    }
  }

  stop(): void {
    this.cueToken++;
    try {
      this.el.pause();
      this.el.removeAttribute("src");
      this.el.load();
    } catch {
      /* ignore */
    }
    this.setGainNow(0);
  }

  setGainNow(v: number): void {
    if (this.gain) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(clamp01(v), now);
    } else {
      this.el.volume = clamp01(v);
    }
  }

  /** Apply a precomputed gain curve over `seconds` (equal-power crossfade in graph mode). */
  applyGainCurve(curve: Float32Array, seconds: number): void {
    if (this.gain) {
      const now = this.ctx.currentTime;
      const g = this.gain.gain;
      const dur = Math.max(0.02, seconds);
      g.cancelScheduledValues(now);
      g.setValueAtTime(curve[0] ?? 0, now);
      try {
        g.setValueCurveAtTime(curve, now, dur);
      } catch {
        g.linearRampToValueAtTime(curve[curve.length - 1] ?? 0, now + dur);
      }
    } else {
      this.el.volume = clamp01(curve[curve.length - 1] ?? 0);
    }
  }

  dispose(): void {
    this.stop();
    try {
      this.node?.disconnect();
      this.gain?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
