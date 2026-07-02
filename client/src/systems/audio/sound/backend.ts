// Self-contained Web Audio backend implementing the `SfxBackend` contract. This is the
// FALLBACK used when the `audio/engine` subsystem has not registered a backend — it makes the
// SFX system fully functional standalone (real spatial audio, real mixing) with no external
// dependencies beyond the browser. When the real engine registers via `setSfxBackend()`, this
// is disposed and all playback routes through the engine instead.
//
// Graph:  source ─▶ [lowpass?] ─▶ gain ─▶ [panner?] ─▶ busGain ─▶ master ─▶ compressor ─▶ out

import type { PlayRequest, SfxBackend, SfxBus, SynthSpec, VoiceHandle } from "./types";
import { SFX_BUSES } from "./types";
import type { Vec3 } from "@sunbreak/shared";
import { renderSynth, synthKey } from "./synth";

const AudioCtor: typeof AudioContext | undefined =
  typeof window !== "undefined"
    ? window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;

function applyPannerPos(ctx: AudioContext, p: PannerNode, pos: Vec3): void {
  const t = ctx.currentTime;
  if (p.positionX) {
    p.positionX.setTargetAtTime(pos.x, t, 0.02);
    p.positionY.setTargetAtTime(pos.y, t, 0.02);
    p.positionZ.setTargetAtTime(pos.z, t, 0.02);
  } else {
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
      pos.x,
      pos.y,
      pos.z,
    );
  }
}

function applyListenerPose(ctx: AudioContext, pos: Vec3, fwd: Vec3, up: Vec3): void {
  const L = ctx.listener;
  const t = ctx.currentTime;
  if (L.positionX) {
    L.positionX.setTargetAtTime(pos.x, t, 0.03);
    L.positionY.setTargetAtTime(pos.y, t, 0.03);
    L.positionZ.setTargetAtTime(pos.z, t, 0.03);
    L.forwardX.setTargetAtTime(fwd.x, t, 0.03);
    L.forwardY.setTargetAtTime(fwd.y, t, 0.03);
    L.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
    L.upX.setTargetAtTime(up.x, t, 0.03);
    L.upY.setTargetAtTime(up.y, t, 0.03);
    L.upZ.setTargetAtTime(up.z, t, 0.03);
  } else {
    const legacy = L as unknown as {
      setPosition(x: number, y: number, z: number): void;
      setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
    };
    legacy.setPosition(pos.x, pos.y, pos.z);
    legacy.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

class Voice implements VoiceHandle {
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    readonly id: number,
    readonly loop: boolean,
    readonly priority: number,
    readonly startedAt: number,
    private readonly source: AudioBufferSourceNode,
    private readonly gainNode: GainNode,
    private readonly panner: PannerNode | null,
    private readonly lowpass: BiquadFilterNode | null,
  ) {}

  get active(): boolean {
    return !this.stopped;
  }

  stop(fadeMs = 0): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    try {
      if (fadeMs > 0) {
        this.gainNode.gain.cancelScheduledValues(t);
        this.gainNode.gain.setTargetAtTime(0.0001, t, fadeMs / 1000 / 3);
        this.source.stop(t + fadeMs / 1000);
      } else {
        this.source.stop();
      }
    } catch {
      /* already stopped */
    }
  }

  setGain(gain: number, tc = 0.02): void {
    if (this.stopped) return;
    try {
      this.gainNode.gain.setTargetAtTime(Math.max(0, gain), this.ctx.currentTime, tc);
    } catch {
      /* noop */
    }
  }

  setRate(rate: number, tc = 0.02): void {
    if (this.stopped) return;
    try {
      this.source.playbackRate.setTargetAtTime(Math.max(0.05, rate), this.ctx.currentTime, tc);
    } catch {
      /* noop */
    }
  }

  setPosition(pos: Vec3): void {
    if (this.panner) applyPannerPos(this.ctx, this.panner, pos);
  }

  setLowpass(hz: number, tc = 0.05): void {
    if (this.lowpass) {
      this.lowpass.frequency.setTargetAtTime(Math.max(20, hz), this.ctx.currentTime, tc);
    }
  }

  dispose(): void {
    this.stopped = true;
    try {
      this.source.disconnect();
      this.gainNode.disconnect();
      this.panner?.disconnect();
      this.lowpass?.disconnect();
    } catch {
      /* noop */
    }
  }
}

interface AssetEntry {
  buffer?: AudioBuffer;
  failed?: boolean;
  loading?: boolean;
}

export class WebAudioBackend implements SfxBackend {
  readonly kind = "fallback" as const;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private readonly buses = new Map<SfxBus, GainNode>();
  private readonly busVol = new Map<SfxBus, number>();
  private masterVol = 0.9;

  private readonly assetCache = new Map<string, AssetEntry>();
  private readonly synthCache = new Map<string, AudioBuffer>();
  private readonly voices = new Set<Voice>();
  private nextId = 1;

  constructor(private readonly cap = 28) {}

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  resume(): void {
    const ctx = this.ensureGraph();
    if (ctx && ctx.state !== "running") void ctx.resume();
  }

  private ensureGraph(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (!AudioCtor) return null;
    const ctx = new AudioCtor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.compressor = comp;

    const master = ctx.createGain();
    master.gain.value = this.masterVol;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    for (const b of SFX_BUSES) {
      const g = ctx.createGain();
      g.gain.value = this.busVol.get(b) ?? 1;
      g.connect(master);
      this.buses.set(b, g);
    }
    return ctx;
  }

  setMasterVolume(v: number, tc = 0.05): void {
    this.masterVol = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  setBusVolume(bus: SfxBus, v: number, tc = 0.05): void {
    this.busVol.set(bus, v);
    const g = this.buses.get(bus);
    if (g && this.ctx) g.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  duck(bus: SfxBus, to: number, tc = 0.15): void {
    const g = this.buses.get(bus);
    if (g && this.ctx) g.gain.setTargetAtTime(to, this.ctx.currentTime, tc);
  }

  setListener(pos: Vec3, forward: Vec3, up: Vec3): void {
    if (this.ctx) applyListenerPose(this.ctx, pos, forward, up);
  }

  activeVoices(): number {
    return this.voices.size;
  }

  play(req: PlayRequest): VoiceHandle | null {
    const ctx = this.ensureGraph();
    if (!ctx) return null;
    // Before unlock, skip one-shots (they'd stack silently); allow loops to start + continue.
    if (ctx.state !== "running") {
      void ctx.resume();
      if (!req.loop) return null;
    }

    let buffer = this.readyAsset(req.urls);
    if (!buffer && req.synth) buffer = this.synthBuffer(req.synth);
    if (!buffer) return null; // asset still decoding, no synth fallback

    if (this.voices.size >= this.cap && !this.steal(req.priority)) return null;

    const bus = this.buses.get(req.bus) ?? this.master;
    if (!bus) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = req.loop;
    src.playbackRate.value = Math.max(0.05, req.rate);

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, req.gain);

    // Loops (engine/siren) + any explicit request get a modulatable lowpass.
    let lowpass: BiquadFilterNode | null = null;
    let head: AudioNode = src;
    if (req.lowpassHz != null || req.loop) {
      lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = req.lowpassHz ?? 20000;
      head.connect(lowpass);
      head = lowpass;
    }
    head.connect(gain);

    let panner: PannerNode | null = null;
    if (req.positional) {
      panner = ctx.createPanner();
      panner.panningModel = "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = req.refDistance;
      panner.maxDistance = req.maxDistance;
      panner.rolloffFactor = req.rolloff;
      if (req.position) applyPannerPos(ctx, panner, req.position);
      gain.connect(panner);
      panner.connect(bus);
    } else {
      gain.connect(bus);
    }

    const voice = new Voice(
      ctx,
      this.nextId++,
      req.loop,
      req.priority,
      ctx.currentTime,
      src,
      gain,
      panner,
      lowpass,
    );
    this.voices.add(voice);
    src.onended = () => {
      voice.dispose();
      this.voices.delete(voice);
    };
    try {
      src.start();
    } catch {
      this.voices.delete(voice);
      return null;
    }
    return voice;
  }

  dispose(): void {
    for (const v of this.voices) v.stop();
    this.voices.clear();
    this.buses.clear();
    this.assetCache.clear();
    this.synthCache.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    if (ctx) void ctx.close().catch(() => {});
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private steal(incomingPriority: number): boolean {
    let victim: Voice | null = null;
    for (const v of this.voices) {
      if (v.loop) continue; // never steal persistent loops
      if (v.priority > incomingPriority) continue;
      if (
        !victim ||
        v.priority < victim.priority ||
        (v.priority === victim.priority && v.startedAt < victim.startedAt)
      ) {
        victim = v;
      }
    }
    if (!victim) return false;
    victim.stop();
    this.voices.delete(victim);
    return true;
  }

  private synthBuffer(spec: SynthSpec): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const key = synthKey(spec);
    let buf = this.synthCache.get(key);
    if (!buf) {
      buf = renderSynth(ctx, spec);
      this.synthCache.set(key, buf);
    }
    return buf;
  }

  private readyAsset(urls?: string[]): AudioBuffer | null {
    if (!urls || urls.length === 0) return null;
    for (const u of urls) {
      const e = this.assetCache.get(u);
      if (e?.buffer) return e.buffer;
    }
    // Kick off the next un-attempted candidate (webm, then mp3), skipping known failures.
    for (const u of urls) {
      const e = this.assetCache.get(u);
      if (!e) {
        this.loadAsset(u);
        return null;
      }
      if (e.failed) continue;
      if (e.loading) return null;
    }
    return null;
  }

  private loadAsset(url: string): void {
    if (this.assetCache.has(url)) return;
    this.assetCache.set(url, { loading: true });
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => {
        const ctx = this.ctx;
        if (!ctx) throw new Error("no ctx");
        return ctx.decodeAudioData(ab);
      })
      .then((buffer) => this.assetCache.set(url, { buffer }))
      .catch(() => this.assetCache.set(url, { failed: true }));
  }
}
