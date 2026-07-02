// Play dispatch — turns a catalog id + options into a resolved backend request, enforcing
// per-event cooldown and max-instances (the backend enforces the global voice cap). This is
// the single choke point every game-event sound flows through.

import type { ClipDef, PlayOptions, PlayRequest, VoiceHandle } from "./types";
import { BUS_DEFAULTS, CATALOG, type SoundEventId } from "./catalog";
import { getBackend } from "./runtime";

const lastPlayAt = new Map<SoundEventId, number>();
const instances = new Map<SoundEventId, Set<VoiceHandle>>();

function activeCount(id: SoundEventId): number {
  const set = instances.get(id);
  if (!set) return 0;
  for (const v of set) if (!v.active) set.delete(v);
  return set.size;
}

function buildRequest(id: SoundEventId, opts: PlayOptions, loop: boolean): PlayRequest {
  const def: ClipDef = CATALOG[id];
  const bd = BUS_DEFAULTS[def.bus];
  const pitchVar = def.pitchVar ?? 0;
  const jitter = pitchVar ? 1 + (Math.random() * 2 - 1) * pitchVar : 1;
  return {
    urls: def.assets,
    synth: def.synth,
    bus: def.bus,
    gain: (def.volume ?? 1) * (opts.gain ?? 1),
    rate: jitter * (opts.rate ?? 1),
    loop,
    positional: def.positional ?? bd.positional,
    position: opts.position,
    refDistance: def.refDistance ?? bd.refDistance,
    maxDistance: def.maxDistance ?? bd.maxDistance,
    rolloff: def.rolloff ?? bd.rolloff,
    priority: opts.priority ?? def.priority ?? bd.priority,
    // Loops get a modulatable filter node seeded from the synth cutoff (engine RPM control);
    // one-shot lowpass is baked into the synth buffer so real assets stay unfiltered.
    lowpassHz: loop ? def.synth?.lowpass : undefined,
  };
}

/** Fire a one-shot game-event sound. Returns null if on cooldown / over its instance cap. */
export function playEvent(id: SoundEventId, opts: PlayOptions = {}): VoiceHandle | null {
  const def = CATALOG[id] as ClipDef | undefined;
  if (!def) return null;

  const now = performance.now();
  if (def.cooldownMs) {
    const last = lastPlayAt.get(id) ?? Number.NEGATIVE_INFINITY;
    if (now - last < def.cooldownMs) return null;
  }
  if (def.maxInstances != null && activeCount(id) >= def.maxInstances) return null;

  const voice = getBackend().play(buildRequest(id, opts, def.loop ?? false));
  if (voice) {
    lastPlayAt.set(id, now);
    if (def.maxInstances != null) {
      let set = instances.get(id);
      if (!set) {
        set = new Set();
        instances.set(id, set);
      }
      set.add(voice);
    }
  }
  return voice;
}

/** Start a looping voice (engine/ambience/emitters). Caller owns the returned handle's life. */
export function startLoop(id: SoundEventId, opts: PlayOptions = {}): VoiceHandle | null {
  if (!CATALOG[id]) return null;
  return getBackend().play(buildRequest(id, opts, true));
}
