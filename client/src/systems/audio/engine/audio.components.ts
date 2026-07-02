// ─────────────────────────────────────────────────────────────────────────────
// ECS augmentation for audio/engine — owned by this subsystem.
// Declaration-merges new `audio_*` fields into the shared `SimComponents` interface.
// This file MUST stay a module (it has imports + an export) or it would silently
// replace `@sunbreak/shared` and break every shared type.
// ─────────────────────────────────────────────────────────────────────────────
import type { Vec3Tuple } from "@sunbreak/shared";
import type { Category, PanningModel } from "./mixer/categories";
import type { AssetId } from "./library/manifest";

/**
 * A looping, positional sound bound to an entity's `transform`. The engine's emitter
 * system keeps one Howler voice per emitter, moves it to the entity each frame, and
 * virtualizes it (pauses/releases the voice) when it leaves the listener's range.
 */
export interface AudioEmitter {
  /** Catalog id of the loop to play (see `manifest.ts`). */
  asset: AssetId;
  /** Mixer category; defaults to the asset's category. */
  category?: Category;
  /** Base gain multiplier before the category/master volume is applied. */
  gain?: number;
  /** Playback rate (1 = normal). Engine sound drives this from RPM. */
  rate?: number;
  /** Loop the source. Defaults to true (emitters are persistent by nature). */
  loop?: boolean;
  /** Panner ref distance (meters at which volume is 1). */
  refDistance?: number;
  /** Panner max distance (beyond which the voice is virtualized). */
  maxDistance?: number;
  /** Distance rolloff factor. */
  rolloff?: number;
  /** Spatialization model for this emitter. */
  panning?: PanningModel;
  /** Local offset added to the entity position (e.g. exhaust height). */
  offset?: Vec3Tuple;
  /** Gameplay can silence an emitter without detaching it. */
  paused?: boolean;
}

declare module "@sunbreak/shared" {
  interface SimComponents {
    /**
     * Tag: this entity is the audio listener. The listener system uses the first
     * tagged entity; if none is tagged it falls back to the local player.
     */
    audio_listener?: true;
    /** A looping positional emitter driven by this entity's transform. */
    audio_emitter?: AudioEmitter;
  }
}
