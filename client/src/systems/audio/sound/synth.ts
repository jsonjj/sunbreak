// Procedural voice synthesis — renders short AudioBuffers for every SynthKind so the game is
// audible with ZERO binary audio assets. Generated tones/noise are CC0 by construction (no
// sourcing, no licensing). When real CC0 files are dropped in, the backend prefers them.
//
// Design notes:
//  - Tonal voices use phase accumulation (correct for pitch sweeps, no aliasing artefacts).
//  - Looping voices (engine/bed/wind/siren) are built to be seam-safe: tonal loops use an
//    integer number of cycles; noise loops are statistically stationary; baked amplitude LFOs
//    return to their start value at the loop point.

import type { SynthKind, SynthSpec } from "./types";

const TAU = Math.PI * 2;

function makeBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  return ctx.createBuffer(1, len, ctx.sampleRate);
}

/** In-place one-pole lowpass. Used to BAKE tone into one-shot synth buffers so that (a) real
 *  CC0 assets stay unfiltered and (b) one-shots need no per-voice filter node. Loop voices
 *  instead get a modulatable BiquadFilter node in the backend (engine RPM control). */
function onePoleLowpass(d: Float32Array, cutoff: number, sr: number): void {
  const dt = 1 / sr;
  const rc = 1 / (TAU * cutoff);
  const a = dt / (rc + dt);
  let y = d[0] ?? 0;
  for (let i = 1; i < d.length; i++) {
    y += a * ((d[i] ?? 0) - y);
    d[i] = y;
  }
}

/** Kinds that produce non-looping one-shots (safe to bake a static lowpass into). */
const ONE_SHOT_KINDS: ReadonlySet<SynthKind> = new Set<SynthKind>([
  "noise_burst",
  "tone_blip",
  "thump",
  "click",
  "shot",
  "screech",
]);

function fillNoise(data: Float32Array, color: "white" | "pink" | "brown" = "white"): void {
  const n = data.length;
  if (color === "white") {
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return;
  }
  if (color === "brown") {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
    return;
  }
  // pink — Paul Kellet's economical approximation
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

function synthNoiseBurst(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = makeBuffer(ctx, (spec.durationMs ?? 120) / 1000);
  const d = buf.getChannelData(0);
  fillNoise(d, spec.noise ?? "white");
  const g = spec.gain ?? 1;
  const k = 6 + (spec.decay ?? 0.85) * 30;
  for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * Math.exp(-k * (i / d.length)) * g;
  return buf;
}

function synthToneBlip(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = makeBuffer(ctx, (spec.durationMs ?? 140) / 1000);
  const d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const f1 = spec.freq ?? 800;
  const f2 = spec.freq2;
  const g = spec.gain ?? 1;
  const k = 2 + (spec.decay ?? 0.5) * 10;
  const n = d.length;
  const half = f2 ? Math.floor(n / 2) : n;
  // Each note restarts phase + envelope at 0 (starts at zero-crossing => no click).
  for (let seg = 0; seg < (f2 ? 2 : 1); seg++) {
    const start = seg === 0 ? 0 : half;
    const end = seg === 0 ? half : n;
    const f = seg === 0 ? f1 : (f2 as number);
    const segLen = end - start;
    let phase = 0;
    for (let i = start; i < end; i++) {
      phase += (TAU * f) / sr;
      const env = Math.exp(-k * ((i - start) / segLen));
      d[i] = Math.sin(phase) * env * g * 0.7;
    }
  }
  return buf;
}

function synthClick(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = makeBuffer(ctx, (spec.durationMs ?? 40) / 1000);
  const d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const f = spec.freq ?? 1600;
  const g = spec.gain ?? 1;
  let phase = 0;
  for (let i = 0; i < d.length; i++) {
    phase += (TAU * f) / sr;
    const env = Math.exp(-30 * (i / d.length));
    d[i] = (Math.sin(phase) * 0.6 + (Math.random() * 2 - 1) * 0.4) * env * g;
  }
  return buf;
}

function synthThump(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = makeBuffer(ctx, (spec.durationMs ?? 200) / 1000);
  const d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const f0 = spec.freq ?? 90;
  const g = spec.gain ?? 1;
  const k = 4 + (spec.decay ?? 0.8) * 12;
  const n = d.length;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (TAU * f0 * (1 + (1 - t) * 0.6)) / sr; // pitch drops for punch
    const env = Math.exp(-k * t);
    const click = i < n * 0.02 ? (Math.random() * 2 - 1) * 0.6 : 0;
    d[i] = (Math.sin(phase) * 0.9 + click) * env * g;
  }
  return buf;
}

function synthShot(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = makeBuffer(ctx, (spec.durationMs ?? 250) / 1000);
  const d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const f0 = spec.freq ?? 120;
  const g = spec.gain ?? 1;
  const kN = 8 + (spec.decay ?? 0.9) * 22;
  const n = d.length;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (TAU * f0 * (1 + (1 - t) * 0.5)) / sr;
    const noise = (Math.random() * 2 - 1) * Math.exp(-kN * t);
    const sub = Math.sin(phase) * Math.exp(-14 * t) * 0.8;
    d[i] = (noise * 0.8 + sub) * g;
  }
  return buf;
}

function synthScreech(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = makeBuffer(ctx, (spec.durationMs ?? 600) / 1000);
  const d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  const f = spec.freq ?? 500;
  const g = spec.gain ?? 1;
  const n = d.length;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.min(1, t * 8) * Math.min(1, (1 - t) * 6); // attack + release
    phase += (TAU * f) / sr;
    const flicker = 0.7 + 0.3 * Math.sin(TAU * 30 * t);
    d[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(phase) * 0.4) * env * flicker * g * 0.7;
  }
  return buf;
}

// ── Looping voices (seam-safe) ─────────────────────────────────────────────

function synthEngine(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const f = spec.freq ?? 58;
  const period = Math.max(2, Math.round(sr / f)); // exact samples/cycle => seamless loop
  const cycles = 8;
  const len = period * cycles;
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const g = spec.gain ?? 1;
  // [harmonic multiple, amplitude]
  const partials: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [2, 0.6],
    [3, 0.4],
    [4, 0.25],
    [6, 0.15],
    [8, 0.08],
  ];
  for (let i = 0; i < len; i++) {
    const ph = i / period; // in cycles
    let v = 0;
    for (const [mult, amp] of partials) v += Math.sin(TAU * mult * ph) * amp;
    v += Math.sin(TAU * 0.5 * ph) * 0.1; // half-order rumble (integer over even `cycles`)
    d[i] = v * 0.18 * g;
  }
  return buf;
}

function synthBed(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(((spec.durationMs ?? 2000) / 1000) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  fillNoise(d, spec.noise ?? "brown");
  const g = spec.gain ?? 1;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const swell = 0.8 + 0.2 * Math.sin(TAU * 2 * t); // 2 swells across loop => continuous
    d[i] = (d[i] ?? 0) * 0.5 * g * swell;
  }
  return buf;
}

function synthWind(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(((spec.durationMs ?? 2400) / 1000) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  fillNoise(d, spec.noise ?? "pink");
  const g = spec.gain ?? 1;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const gust = 0.5 + 0.5 * Math.abs(Math.sin(TAU * t)); // returns to 0.5 at seam
    d[i] = (d[i] ?? 0) * 0.4 * g * gust;
  }
  return buf;
}

function synthSiren(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(((spec.durationMs ?? 1500) / 1000) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const f1 = spec.freq ?? 680;
  const f2 = spec.freq2 ?? 920;
  const g = spec.gain ?? 1;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const lfo = 0.5 - 0.5 * Math.cos(TAU * t); // 0..1..0 across the loop
    phase += (TAU * (f1 + (f2 - f1) * lfo)) / sr;
    const edge = Math.min(1, t * 20) * Math.min(1, (1 - t) * 20); // tiny fade guards the seam
    d[i] = Math.sin(phase) * 0.35 * g * edge;
  }
  return buf;
}

function renderRaw(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  switch (spec.kind) {
    case "noise_burst":
      return synthNoiseBurst(ctx, spec);
    case "tone_blip":
      return synthToneBlip(ctx, spec);
    case "thump":
      return synthThump(ctx, spec);
    case "click":
      return synthClick(ctx, spec);
    case "shot":
      return synthShot(ctx, spec);
    case "engine":
      return synthEngine(ctx, spec);
    case "bed":
      return synthBed(ctx, spec);
    case "wind":
      return synthWind(ctx, spec);
    case "screech":
      return synthScreech(ctx, spec);
    case "siren":
      return synthSiren(ctx, spec);
  }
}

/** Render a procedural voice. Bakes the lowpass into one-shot buffers; loop voices are shaped
 *  by a modulatable filter node in the backend instead. */
export function renderSynth(ctx: BaseAudioContext, spec: SynthSpec): AudioBuffer {
  const buf = renderRaw(ctx, spec);
  if (spec.lowpass && ONE_SHOT_KINDS.has(spec.kind)) {
    onePoleLowpass(buf.getChannelData(0), spec.lowpass, ctx.sampleRate);
  }
  return buf;
}

/** A stable cache key for a synth spec (so identical voices are generated once). */
export function synthKey(spec: SynthSpec): string {
  return `${spec.kind}|${spec.durationMs ?? 0}|${spec.freq ?? 0}|${spec.freq2 ?? 0}|${
    spec.decay ?? 0
  }|${spec.lowpass ?? 0}|${spec.noise ?? ""}|${spec.gain ?? 0}`;
}
