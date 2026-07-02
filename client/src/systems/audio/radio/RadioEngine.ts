// RadioEngine — the imperative playback controller. Owns the 2-deck crossfader, the live-clock
// scheduler and the stall/404 watchdog. It routes audio through the AUDIO ENGINE's shared graph
// (via `audioBridge`) and never touches React or the render loop (scheduling is timer-driven).
//
// Graph:  deckA.gain ┐
//                     ├─> mix ─> duck ─> muffle(lowpass) ─> out ─> backend.destination
//         deckB.gain ┘
import {
  currentBackend,
  holdContextAwake,
  resolveRadioBackend,
  subscribeBackend,
} from "./audioBridge";
import { StreamingDeck } from "./StreamingDeck";
import { buildCycle, nowPlaying, type BroadcastCycle } from "./StationProgrammer";
import type { NowPlaying, RadioAudioBackend, RadioElement, RadioStatus, StationDef } from "./types";

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const CURVE_STEPS = 32;
function makeCurve(fadeIn: boolean): Float32Array {
  const c = new Float32Array(CURVE_STEPS);
  for (let i = 0; i < CURVE_STEPS; i++) {
    const t = i / (CURVE_STEPS - 1);
    c[i] = fadeIn ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
  }
  return c;
}
const FADE_IN = makeCurve(true); // 0 -> 1 (equal-power)
const FADE_OUT = makeCurve(false); // 1 -> 0 (equal-power)

const TICK_MS = 250;
const PRELOAD_SLACK_SEC = 1.5;
const CUE_TIMEOUT_MS = 9000;
const MAX_CONSECUTIVE_FAILS = 4;
const OFFAIR_RETRY_MS = 5000;
const MUFFLE_OPEN_HZ = 20000;
const MUFFLE_CLOSED_HZ = 700;

export interface RadioEngineCallbacks {
  onUpdate: (nowPlaying: NowPlaying | null, status: RadioStatus) => void;
  onReady?: (ready: boolean) => void;
}

export class RadioEngine {
  private readonly cb: RadioEngineCallbacks;

  private backend: RadioAudioBackend | null = null;
  private decks: StreamingDeck[] | null = null;
  private mix: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private out: GainNode | null = null;

  private powered = false;
  private station: StationDef | null = null;
  private cycle: BroadcastCycle | null = null;

  private activeDeck = 0;
  private currentIndex = 0;
  private transitioning = false;
  private nextCued: { index: number; deck: number } | null = null;
  private nextCuePending = false;
  private consecutiveFailures = 0;
  /** Generation counter — bumped on jumps so stale async cues self-cancel. */
  private gen = 0;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private offAirTimer: ReturnType<typeof setTimeout> | null = null;

  private volume = 1; // user radio trim (0..1)
  private receiverVolume = 1; // per-entity trim (0..1)
  private duckLevel = 1; // our own duck multiplier (0..1)
  private muffled = false;
  private userGestured = false;
  private baseGainUnsub: (() => void) | null = null;
  private backendUnsub: (() => void) | null = null;

  constructor(cb: RadioEngineCallbacks) {
    this.cb = cb;
    this.backendUnsub = subscribeBackend(() => this.onBackendSwap());
  }

  // ── public API ────────────────────────────────────────────────────────────

  get audioReady(): boolean {
    return !!this.backend && this.backend.context.state === "running";
  }

  get backendSource(): string | null {
    return this.backend?.source ?? null;
  }

  /**
   * Record a user gesture and resume the context if we already hold one. We intentionally do NOT
   * create the graph here — deferring backend resolution to first power lets the (Howler-based)
   * audio engine come up first, so we share its context instead of spinning up a standalone one.
   */
  async unlock(): Promise<void> {
    this.userGestured = true;
    if (!this.backend) return;
    try {
      await this.backend.resume?.();
    } catch {
      /* ignore */
    }
    this.cb.onReady?.(this.audioReady);
  }

  setPowered(on: boolean): void {
    if (on === this.powered) return;
    this.powered = on;
    if (on) {
      if (!this.ensureGraph()) {
        this.powered = false;
        return;
      }
      if (this.backend) holdContextAwake(this.backend, true);
      void this.backend?.resume?.();
      this.startTick();
      if (this.station) this.retune(true);
      else this.cb.onUpdate(null, "off");
    } else {
      this.beginGeneration();
      this.stopTick();
      this.clearOffAir();
      if (this.decks) for (const d of this.decks) d.stop();
      if (this.backend) holdContextAwake(this.backend, false);
      this.cb.onUpdate(null, "off");
    }
  }

  /** Tune to a station. When `live`, seeks to the station's current broadcast position. */
  tune(station: StationDef, live = true): void {
    const changed = this.station?.id !== station.id;
    this.station = station;
    this.cycle = buildCycle(station);
    this.consecutiveFailures = 0;
    this.clearOffAir();
    if (!this.powered) return;
    if (changed || live) this.retune(live);
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    this.recomputeOut();
  }

  setReceiverVolume(v: number): void {
    this.receiverVolume = clamp01(v);
    this.recomputeOut();
  }

  /** Duck the radio (e.g. for dialogue / mission VO). `target` 0..1; restore with duck(1, ms). */
  duck(target: number, ms = 250): void {
    this.duckLevel = clamp01(target);
    if (!this.duckGain || !this.backend) return;
    const now = this.backend.context.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setTargetAtTime(this.duckLevel, now, Math.max(0.01, ms / 1000) / 3);
  }

  setMuffled(muffled: boolean, ms = 200): void {
    if (muffled === this.muffled && this.muffle) return;
    this.muffled = muffled;
    if (!this.muffle || !this.backend) return;
    const now = this.backend.context.currentTime;
    const target = muffled ? MUFFLE_CLOSED_HZ : MUFFLE_OPEN_HZ;
    this.muffle.frequency.cancelScheduledValues(now);
    this.muffle.frequency.setTargetAtTime(target, now, Math.max(0.01, ms / 1000) / 3);
  }

  dispose(): void {
    this.setPowered(false);
    this.backendUnsub?.();
    this.baseGainUnsub?.();
    this.backendUnsub = null;
    this.baseGainUnsub = null;
    if (this.decks) for (const d of this.decks) d.dispose();
    try {
      this.mix?.disconnect();
      this.duckGain?.disconnect();
      this.muffle?.disconnect();
      this.out?.disconnect();
    } catch {
      /* ignore */
    }
    // Close only a context WE created (standalone); never close the engine's shared context.
    if (this.backend?.source === "standalone") {
      try {
        void this.backend.context.close();
      } catch {
        /* ignore */
      }
    }
    this.decks = null;
    this.backend = null;
  }

  // ── graph ─────────────────────────────────────────────────────────────────

  private ensureGraph(): boolean {
    if (this.decks && this.backend) return true;
    const backend = resolveRadioBackend();
    if (!backend) return false;
    this.backend = backend;
    const ctx = backend.context;

    this.mix = ctx.createGain();
    this.mix.gain.value = 1;
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = this.duckLevel;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = this.muffled ? MUFFLE_CLOSED_HZ : MUFFLE_OPEN_HZ;
    this.muffle.Q.value = 0.7;
    this.out = ctx.createGain();
    this.out.gain.value = 0;

    this.mix
      .connect(this.duckGain)
      .connect(this.muffle)
      .connect(this.out)
      .connect(backend.destination);
    this.decks = [new StreamingDeck(ctx, this.mix), new StreamingDeck(ctx, this.mix)];

    this.baseGainUnsub?.();
    this.baseGainUnsub = backend.onBaseGainChange?.(() => this.recomputeOut()) ?? null;
    this.recomputeOut();
    if (this.userGestured) void backend.resume?.();
    return true;
  }

  private recomputeOut(): void {
    if (!this.out || !this.backend) return;
    const base = this.backend.getBaseGain?.() ?? 1;
    const engineDuck = this.backend.getDuckGain?.() ?? 1;
    const target = clamp01(base) * this.volume * this.receiverVolume * clamp01(engineDuck);
    const now = this.backend.context.currentTime;
    this.out.gain.setTargetAtTime(target, now, 0.05);
  }

  private onBackendSwap(): void {
    const next = currentBackend();
    if (!next || next === this.backend) return;
    const wasPowered = this.powered;
    this.setPowered(false);
    if (this.decks) for (const d of this.decks) d.dispose();
    this.decks = null;
    this.baseGainUnsub?.();
    this.baseGainUnsub = null;
    this.mix = this.duckGain = this.muffle = this.out = null;
    this.backend = null;
    if (wasPowered) this.setPowered(true);
  }

  // ── scheduling ──────────────────────────────────────────────────────────────

  private startTick(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.transitionTimer = this.stopTimer = null;
  }

  private clearOffAir(): void {
    if (this.offAirTimer) clearTimeout(this.offAirTimer);
    this.offAirTimer = null;
  }

  private beginGeneration(): void {
    this.gen++;
    this.transitioning = false;
    this.nextCued = null;
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.transitionTimer = this.stopTimer = null;
  }

  private ensureRunning(): void {
    const ctx = this.backend?.context;
    if (ctx && ctx.state !== "running") void ctx.resume();
  }

  private elementAt(index: number): RadioElement | null {
    return this.cycle?.elements[index] ?? null;
  }

  private retune(live: boolean): void {
    if (!this.cycle) return;
    const start = live ? nowPlaying(this.cycle, Date.now()) : { index: 0, offsetSec: 0 };
    this.startAt(start.index, start.offsetSec, false);
  }

  /** Start (or hard-cut to) a cycle element. `crossfade=false` for tunes/skips. */
  private startAt(index: number, offsetSec: number, crossfade: boolean): void {
    const decks = this.decks;
    const el = this.elementAt(index);
    if (!decks || !el) {
      this.enterOffAir();
      return;
    }
    this.beginGeneration();
    const token = this.gen;
    const targetDeck = crossfade ? 1 - this.activeDeck : this.activeDeck;
    const deck = decks[targetDeck];
    if (!deck) return;

    this.cb.onUpdate(this.makeNP(el, index, offsetSec), "loading");

    void deck.cue(el.src, offsetSec, CUE_TIMEOUT_MS).then((ok) => {
      const live = this.decks;
      if (token !== this.gen || !this.powered || !live) return;
      if (!ok) {
        this.onLoadFail(index);
        return;
      }
      this.consecutiveFailures = 0;
      this.ensureRunning();
      deck.play();
      if (crossfade) {
        const outgoing = live[this.activeDeck];
        const xf = this.effXf();
        deck.applyGainCurve(FADE_IN, xf);
        outgoing?.applyGainCurve(FADE_OUT, xf);
        if (outgoing) this.scheduleStop(outgoing, xf);
      } else {
        deck.setGainNow(1);
        live[1 - targetDeck]?.stop();
      }
      this.activeDeck = targetDeck;
      this.currentIndex = index;
      this.report(el, index, offsetSec);
    });
  }

  private tick(): void {
    if (!this.powered || !this.decks) return;
    this.ensureRunning();
    if (this.transitioning) return;

    const active = this.decks[this.activeDeck];
    const el = this.elementAt(this.currentIndex);
    if (!active || !el) return;
    const dur = active.duration || el.durationSec;
    const remaining = dur - active.currentTime;
    const xf = this.effXf();

    if (remaining <= xf + PRELOAD_SLACK_SEC && !this.nextCued && !this.nextCuePending) {
      this.preloadNext();
    }
    if (remaining <= Math.max(xf, 0.15)) {
      this.doTransition(remaining);
    }
  }

  private preloadNext(): void {
    const decks = this.decks;
    if (!this.cycle || !decks || this.nextCued || this.nextCuePending) return;
    const nextIndex = (this.currentIndex + 1) % this.cycle.elements.length;
    const nextEl = this.elementAt(nextIndex);
    if (!nextEl) return;
    const idle = 1 - this.activeDeck;
    const idleDeck = decks[idle];
    if (!idleDeck) return;
    const token = this.gen;
    this.nextCuePending = true;
    void idleDeck.cue(nextEl.src, 0, CUE_TIMEOUT_MS).then((ok) => {
      this.nextCuePending = false;
      if (token !== this.gen || !this.powered) return;
      this.nextCued = ok ? { index: nextIndex, deck: idle } : null;
      if (!ok) this.consecutiveFailures++;
    });
  }

  private doTransition(remaining: number): void {
    const decks = this.decks;
    if (!this.cycle || !decks || this.transitioning) return;
    const active = decks[this.activeDeck];
    if (!active) return;

    if (this.nextCued) {
      const { index, deck } = this.nextCued;
      const nextEl = this.elementAt(index);
      const incoming = decks[deck];
      if (!nextEl || !incoming) {
        this.nextCued = null;
        return;
      }
      this.transitioning = true;
      this.nextCued = null;
      this.ensureRunning();
      incoming.play();
      const xf = Math.min(this.effXf(), remaining > 0.05 ? remaining : this.effXf());
      if (xf > 0.05) {
        incoming.applyGainCurve(FADE_IN, xf);
        active.applyGainCurve(FADE_OUT, xf);
      } else {
        incoming.setGainNow(1);
        active.setGainNow(0);
      }
      this.scheduleStop(active, xf);
      this.activeDeck = deck;
      this.currentIndex = index;
      this.report(nextEl, index, 0);
      this.consecutiveFailures = 0;
      if (this.transitionTimer) clearTimeout(this.transitionTimer);
      this.transitionTimer = setTimeout(
        () => {
          this.transitioning = false;
        },
        Math.max(50, xf * 1000 + 60),
      );
    } else if (remaining <= 0.12) {
      // Next element didn't load in time — hard-skip forward (watchdog handles dead air).
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILS) {
        this.enterOffAir();
        return;
      }
      const nextIndex = (this.currentIndex + 1) % this.cycle.elements.length;
      this.startAt(nextIndex, 0, false);
    }
  }

  private scheduleStop(deck: StreamingDeck, seconds: number): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => deck.stop(), Math.max(50, seconds * 1000 + 90));
  }

  private onLoadFail(index: number): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILS) {
      this.enterOffAir();
      return;
    }
    if (!this.cycle) return;
    const nextIndex = (index + 1) % this.cycle.elements.length;
    this.startAt(nextIndex, 0, false);
  }

  private enterOffAir(): void {
    this.beginGeneration();
    if (this.decks) for (const d of this.decks) d.stop();
    this.cb.onUpdate(null, "offair");
    this.clearOffAir();
    this.offAirTimer = setTimeout(() => {
      this.consecutiveFailures = 0;
      if (this.powered && this.station) {
        this.cycle = buildCycle(this.station);
        this.retune(true);
      }
    }, OFFAIR_RETRY_MS);
  }

  private effXf(): number {
    const base = this.station?.clock.crossfadeSec ?? 2.5;
    const active = this.decks?.[this.activeDeck];
    if (active && !active.graphMode) return 0; // element-only mode → hard cut
    const el = this.elementAt(this.currentIndex);
    if (el && (el.durationSec <= 6 || el.category === "ident" || el.category === "sweeper")) {
      return Math.min(base, 0.4);
    }
    return base;
  }

  private makeNP(el: RadioElement, index: number, offsetSec: number): NowPlaying {
    const st = this.station;
    return {
      stationId: st?.id ?? "",
      stationName: st?.name ?? "",
      colorHex: st?.colorHex ?? "#ffffff",
      elementId: el.id,
      category: el.category,
      title: el.title,
      artist: el.artist,
      index,
      offsetSec,
      durationSec: el.durationSec,
      startedAtMs: performance.now() - offsetSec * 1000,
    };
  }

  private report(el: RadioElement, index: number, offsetSec: number): void {
    this.cb.onUpdate(this.makeNP(el, index, offsetSec), "playing");
  }
}
