// Typewriter pacer. Streamed tokens are buffered in a ref-like class and flushed on
// requestAnimationFrame at REVEAL_CPS — NEVER setState per token (R3F/React churn rule).
// Collapses to instant under `prefers-reduced-motion` or an explicit skip.

import { REVEAL_CPS } from "./constants";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Reveal {
  private target = "";
  private shown = 0;
  private raf = 0;
  private lastT = 0;
  private readonly cps = REVEAL_CPS;

  /** Called at most once per animation frame with the currently-revealed substring. */
  onFlush: ((text: string) => void) | null = null;

  /** The complete text received so far (independent of what's been revealed). */
  get full(): string {
    return this.target;
  }

  get isComplete(): boolean {
    return this.shown >= this.target.length;
  }

  /** Append a streamed token and (re)start pacing. */
  push(delta: string): void {
    this.target += delta;
    this.ensureRunning();
  }

  /** Clear everything for a fresh line. */
  reset(): void {
    this.stop();
    this.target = "";
    this.shown = 0;
    this.lastT = 0;
    this.flush();
  }

  /** Fast-forward to fully revealed (skip / reduced-motion). */
  skip(): void {
    this.shown = this.target.length;
    this.stop();
    this.flush();
  }

  private ensureRunning(): void {
    if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      this.shown = this.target.length;
      this.flush();
      return;
    }
    if (this.raf) return;
    this.lastT =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (t: number): void => {
    const dt = Math.max(0, (t - this.lastT) / 1000);
    this.lastT = t;
    this.shown = Math.min(this.target.length, this.shown + this.cps * dt);
    this.flush();
    if (this.shown < this.target.length) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
    }
  };

  private stop(): void {
    if (this.raf && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.raf);
    }
    this.raf = 0;
  }

  private flush(): void {
    this.onFlush?.(this.target.slice(0, Math.floor(this.shown)));
  }
}
