// Looping positional emitters (vehicle engines, ambient point sources). Each emitter holds one
// Howler voice while the listener is in range and is "virtualized" (voice released, state kept)
// when out of range — so a dense city never wastes voices on distant loops. Emitters can be
// created manually (with a position source) or bound to ECS entities via `startEmitterRuntime`.
import type { PannerAttributes } from "howler";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { AudioEmitter } from "../audio.components";
import { getAsset } from "../library/manifest";
import {
  CATEGORY_PRIORITY,
  DEFAULT_PANNER,
  FALLBACK_PANNER,
  type Category,
} from "../mixer/categories";
import { VoiceManager, type Voice } from "../voices/VoiceManager";
import { SoundPool } from "../voices/SoundPool";
import { effVol } from "../mixer/mixerStore";
import { distanceSqToListener } from "./listener";
import { getDefaultPanningModel, isAudioUnlocked } from "../AudioEngine";

export type PositionSource = () => readonly [number, number, number] | null;

export interface EmitterHandle {
  readonly id: number;
  /** Merge changes into the emitter spec (e.g. engine RPM -> rate). */
  setSpec(patch: Partial<AudioEmitter>): void;
  setPaused(paused: boolean): void;
  detach(): void;
}

interface Emitter {
  id: number;
  spec: AudioEmitter; // stored by reference so ECS mutations are picked up live
  getPos: PositionSource;
  voice: Voice | null;
  active: boolean;
  category: Category;
  assetVolume: number;
}

// Hysteresis so an emitter parked on the range boundary doesn't thrash on/off.
const HYST_IN = 0.9;
const HYST_OUT = 1.15;

let seq = 0;
const emitters = new Set<Emitter>();

function resolveCategory(spec: AudioEmitter): Category {
  return spec.category ?? getAsset(spec.asset)?.category ?? "ambience";
}

function pannerFor(spec: AudioEmitter, category: Category): PannerAttributes {
  const base = DEFAULT_PANNER[category] ?? FALLBACK_PANNER;
  return {
    ...base,
    ...(spec.refDistance != null ? { refDistance: spec.refDistance } : {}),
    ...(spec.maxDistance != null ? { maxDistance: spec.maxDistance } : {}),
    ...(spec.rolloff != null ? { rolloffFactor: spec.rolloff } : {}),
    panningModel: spec.panning ?? base.panningModel ?? getDefaultPanningModel(),
  };
}

function maxDistanceOf(spec: AudioEmitter, category: Category): number {
  return spec.maxDistance ?? DEFAULT_PANNER[category]?.maxDistance ?? FALLBACK_PANNER.maxDistance ?? 80;
}

function activate(em: Emitter, pos: readonly [number, number, number]): void {
  const asset = getAsset(em.spec.asset);
  if (!asset) return;
  em.category = resolveCategory(em.spec);
  em.assetVolume = asset.volume ?? 1;
  const priority = CATEGORY_PRIORITY[em.category] ?? 40;
  const voice = VoiceManager.request({
    category: em.category,
    priority,
    kind: "loop",
    getPos: em.getPos,
  });
  if (!voice) return; // over budget — stay virtual and retry next frame
  const acq = SoundPool.acquire(em.spec.asset);
  if (!acq) {
    VoiceManager.cancel(voice);
    return;
  }
  const base = em.spec.gain ?? em.assetVolume;
  VoiceManager.commit(voice, acq.howl, acq.soundId, em.spec.asset, base);
  acq.howl.loop(em.spec.loop ?? true, acq.soundId);
  acq.howl.pannerAttr(pannerFor(em.spec, em.category), acq.soundId);
  acq.howl.pos(pos[0], pos[1], pos[2], acq.soundId);
  acq.howl.rate(em.spec.rate ?? 1, acq.soundId);
  em.voice = voice;
  em.active = true;
}

function deactivate(em: Emitter): void {
  if (em.voice) VoiceManager.stop(em.voice);
  em.voice = null;
  em.active = false;
}

/** Push live spec/pos to an active emitter's voice (pos, rate, volume every frame; cheap). */
function apply(em: Emitter, pos: readonly [number, number, number]): void {
  const v = em.voice;
  if (!v || !v.howl || v.soundId < 0) return;
  const base = em.spec.gain ?? em.assetVolume;
  v.category = em.category;
  v.base = base;
  v.howl.pos(pos[0], pos[1], pos[2], v.soundId);
  v.howl.rate(em.spec.rate ?? 1, v.soundId);
  v.howl.volume(em.spec.paused ? 0 : effVol(em.category, base), v.soundId);
}

/**
 * Create a looping emitter driven by a position source. Retains the given `spec` object by
 * reference (mutate it or call `setSpec` to change rate/gain/pause). Call `detach()` to stop it.
 */
export function createEmitter(spec: AudioEmitter, getPos: PositionSource): EmitterHandle {
  const em: Emitter = {
    id: ++seq,
    spec,
    getPos,
    voice: null,
    active: false,
    category: resolveCategory(spec),
    assetVolume: getAsset(spec.asset)?.volume ?? 1,
  };
  emitters.add(em);
  return {
    id: em.id,
    setSpec: (patch) => {
      Object.assign(em.spec, patch);
      em.category = resolveCategory(em.spec);
      const v = em.voice;
      if (em.active && v?.howl && v.soundId >= 0) {
        v.howl.pannerAttr(pannerFor(em.spec, em.category), v.soundId);
        v.howl.loop(em.spec.loop ?? true, v.soundId);
      }
    },
    setPaused: (paused) => {
      em.spec.paused = paused;
    },
    detach: () => {
      deactivate(em);
      emitters.delete(em);
    },
  };
}

/** Per-frame sync: move active emitters, (de)activate by distance. Called by the emitter system. */
export function syncEmitters(): void {
  if (!isAudioUnlocked()) return; // loops would just queue; retry once audio is unlocked
  for (const em of emitters) {
    // If the VoiceManager stole this emitter's voice, fall back to virtual so it can re-acquire.
    if (em.active && (!em.voice || em.voice.released)) {
      em.active = false;
      em.voice = null;
    }
    const pos = em.getPos();
    if (!pos) {
      if (em.active) deactivate(em);
      continue;
    }
    const maxD = maxDistanceOf(em.spec, em.category);
    const dsq = distanceSqToListener(pos);
    if (em.active) {
      const cutoff = maxD * HYST_OUT;
      if (dsq > cutoff * cutoff) {
        deactivate(em);
        continue;
      }
      apply(em, pos);
    } else {
      const enter = maxD * HYST_IN;
      if (dsq <= enter * enter) activate(em, pos);
    }
  }
}

export function emitterCount(): number {
  return emitters.size;
}

export function detachAllEmitters(): void {
  for (const em of [...emitters]) {
    deactivate(em);
    emitters.delete(em);
  }
}

/**
 * Bind ECS `audio_emitter` entities to emitters automatically: an emitter is created when an
 * entity gains the component and detached when it loses it / is removed. The emitter follows the
 * entity's `transform` (+ optional `offset`). Returns a stop() that tears everything down.
 */
export function startEmitterRuntime(): () => void {
  const query = world.with("audio_emitter", "transform");
  const handles = new Map<ClientEntity, EmitterHandle>();

  const add = (e: ClientEntity): void => {
    const spec = e.audio_emitter;
    if (!spec || handles.has(e)) return;
    const handle = createEmitter(spec, () => {
      const t = e.transform;
      if (!t) return null;
      const o = spec.offset;
      return o
        ? [t.position.x + o[0], t.position.y + o[1], t.position.z + o[2]]
        : [t.position.x, t.position.y, t.position.z];
    });
    handles.set(e, handle);
  };

  const remove = (e: ClientEntity): void => {
    const handle = handles.get(e);
    if (handle) {
      handle.detach();
      handles.delete(e);
    }
  };

  for (const e of query) add(e);
  const offAdd = query.onEntityAdded.subscribe(add);
  const offRemove = query.onEntityRemoved.subscribe(remove);

  return () => {
    offAdd();
    offRemove();
    for (const handle of handles.values()) handle.detach();
    handles.clear();
  };
}
