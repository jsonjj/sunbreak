// Deterministic station programmer. From a station's `seed` + `clock`, it expands a full, stable
// broadcast cycle (every song plays once, interstitials interleaved per the clock pattern) and
// resolves the "live" clock: at any wall-clock instant, which element is playing and at what
// offset — so tuning in mid-broadcast feels like the station was already on the air.
import type { RadioCategory, RadioElement, StationDef } from "./types";

/** Tiny inline PRNG (no dep). Same seed → same sequence on every client. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

export interface BroadcastCycle {
  stationId: string;
  elements: RadioElement[];
  /** Total cycle length in seconds (never 0). */
  cycleSec: number;
}

const INTERSTITIALS: readonly RadioCategory[] = ["djLink", "ad", "ident", "sweeper", "news"];

function poolFor(station: StationDef, cat: RadioCategory): RadioElement[] {
  switch (cat) {
    case "song":
      return station.songs;
    case "djLink":
      return station.djLinks;
    case "ad":
      return station.ads;
    case "ident":
      return station.idents;
    case "sweeper":
      return station.sweepers;
    case "news":
      return station.news ?? [];
  }
}

/**
 * Build the deterministic broadcast cycle for a station. Every song is scheduled exactly once;
 * interstitials are drawn round-robin from their own shuffled pools at the pattern's positions.
 */
export function buildCycle(station: StationDef): BroadcastCycle {
  const rng = mulberry32(station.seed);
  const songs = shuffle(station.songs, rng);

  const pools = new Map<RadioCategory, RadioElement[]>();
  const cursors = new Map<RadioCategory, number>();
  for (const cat of INTERSTITIALS) {
    pools.set(cat, shuffle(poolFor(station, cat), rng));
    cursors.set(cat, 0);
  }
  const nextFrom = (cat: RadioCategory): RadioElement | undefined => {
    const pool = pools.get(cat);
    if (!pool || pool.length === 0) return undefined;
    const cursor = cursors.get(cat) ?? 0;
    cursors.set(cat, cursor + 1);
    return pool[cursor % pool.length];
  };

  const elements: RadioElement[] = [];

  if (songs.length === 0) {
    // Music-less station (e.g. all-talk): schedule one pass of the pattern's interstitials.
    for (const cat of station.clock.pattern) {
      if (cat === "song") continue;
      const e = nextFrom(cat);
      if (e) elements.push(e);
    }
  } else {
    // Guarantee songs get consumed even if a pattern forgot the "song" token.
    const pattern: RadioCategory[] = station.clock.pattern.includes("song")
      ? station.clock.pattern
      : ["song", ...station.clock.pattern];
    let songIdx = 0;
    let patternIdx = 0;
    const guard = pattern.length * (songs.length + INTERSTITIALS.length) + 64;
    let steps = 0;
    while (songIdx < songs.length && steps++ < guard) {
      const cat = pattern[patternIdx % pattern.length];
      patternIdx++;
      if (!cat) continue;
      if (cat === "song") {
        const track = songs[songIdx++];
        if (track) elements.push(track);
      } else {
        const e = nextFrom(cat);
        if (e) elements.push(e);
      }
    }
  }

  if (elements.length === 0) elements.push(...station.songs);

  const cycleSec = elements.reduce((sum, e) => sum + Math.max(1, e.durationSec), 0) || 1;
  return { stationId: station.id, elements, cycleSec };
}

/** Resolve the live clock at time `tMs` → the cycle index + how far into it (seconds). */
export function nowPlaying(cycle: BroadcastCycle, tMs: number): { index: number; offsetSec: number } {
  const { elements, cycleSec } = cycle;
  if (elements.length === 0) return { index: 0, offsetSec: 0 };
  const epoch = (((tMs / 1000) % cycleSec) + cycleSec) % cycleSec;
  let acc = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const dur = Math.max(1, el.durationSec);
    if (acc + dur > epoch) return { index: i, offsetSec: epoch - acc };
    acc += dur;
  }
  return { index: 0, offsetSec: 0 };
}
