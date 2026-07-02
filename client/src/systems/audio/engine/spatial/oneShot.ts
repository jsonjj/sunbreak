// Fire-and-forget one-shots: distance-culled, voice-limited, pooled, spatialized. The core
// gameplay entry point — combat, footsteps, impacts and remote-player events all funnel here.
import type { PannerAttributes } from "howler";
import type { Vec3Tuple } from "@sunbreak/shared";
import { getAsset, hasAsset, type AssetId } from "../library/manifest";
import {
  CATEGORY_PRIORITY,
  DEFAULT_PANNER,
  FALLBACK_PANNER,
  type Category,
  type PanningModel,
} from "../mixer/categories";
import { VoiceManager } from "../voices/VoiceManager";
import { SoundPool } from "../voices/SoundPool";
import { distanceSqToListener } from "./listener";
import { getDefaultPanningModel, isAudioUnlocked, playBeep } from "../AudioEngine";

export interface OneShotOpts {
  /** Steal priority (higher wins). Defaults to asset/category priority. */
  priority?: number;
  /** Base gain (0..1) before category/master. Defaults to asset volume. */
  gain?: number;
  /** Playback rate; omitted => small pitch jitter for variety. */
  rate?: number;
  /** Route through a different category than the asset's default. */
  category?: Category;
  /** Per-play panner overrides (merged over category + asset). */
  panner?: PannerAttributes;
  /** Force a panning model for this play. */
  panning?: PanningModel;
  /** Sprite slice name to play (for packed assets). */
  sprite?: string;
  /** Drop the play while audio is still locked (default true). */
  requireUnlock?: boolean;
}

const jitter = (min = 0.94, max = 1.06): number => min + Math.random() * (max - min);

/**
 * Play a positional one-shot at a world position. Returns the Howler sound id (globally unique)
 * or null if it was culled/dropped/unknown.
 */
export function playSpatial(id: AssetId, position: Vec3Tuple, opts: OneShotOpts = {}): number | null {
  const asset = getAsset(id);
  if (!asset) return null;
  if ((opts.requireUnlock ?? true) && !isAudioUnlocked()) return null;

  const category = opts.category ?? asset.category;
  const panner: PannerAttributes = {
    ...(DEFAULT_PANNER[category] ?? FALLBACK_PANNER),
    ...asset.panner,
    ...opts.panner,
  };
  if (opts.panning) panner.panningModel = opts.panning;
  else if (!panner.panningModel) panner.panningModel = getDefaultPanningModel();

  // Distance-cull before spending a voice.
  const maxD = panner.maxDistance ?? FALLBACK_PANNER.maxDistance ?? 80;
  if (distanceSqToListener(position) > maxD * maxD) return null;

  const priority = opts.priority ?? asset.priority ?? CATEGORY_PRIORITY[category];
  const pos: readonly [number, number, number] = [position[0], position[1], position[2]];
  const voice = VoiceManager.request({ category, priority, kind: "oneshot", getPos: () => pos });
  if (!voice) return null;

  const acq = SoundPool.acquire(id, opts.sprite);
  if (!acq) {
    VoiceManager.cancel(voice);
    return null;
  }

  const base = opts.gain ?? asset.volume ?? 1;
  VoiceManager.commit(voice, acq.howl, acq.soundId, id, base);
  acq.howl.pannerAttr(panner, acq.soundId);
  acq.howl.pos(position[0], position[1], position[2], acq.soundId);
  acq.howl.rate(opts.rate ?? jitter(), acq.soundId);
  acq.howl.once("end", () => VoiceManager.release(voice), acq.soundId);
  return acq.soundId;
}

/** Play a non-spatial (2D/stereo) one-shot — UI, non-diegetic dialogue, stingers. */
export function play2D(id: AssetId, opts: OneShotOpts = {}): number | null {
  const asset = getAsset(id);
  if (!asset) return null;
  if ((opts.requireUnlock ?? true) && !isAudioUnlocked()) return null;

  const category = opts.category ?? asset.category;
  const priority = opts.priority ?? asset.priority ?? CATEGORY_PRIORITY[category];
  const voice = VoiceManager.request({ category, priority, kind: "oneshot" });
  if (!voice) return null;

  const acq = SoundPool.acquire(id, opts.sprite);
  if (!acq) {
    VoiceManager.cancel(voice);
    return null;
  }
  const base = opts.gain ?? asset.volume ?? 1;
  VoiceManager.commit(voice, acq.howl, acq.soundId, id, base);
  acq.howl.rate(opts.rate ?? 1, acq.soundId);
  acq.howl.once("end", () => VoiceManager.release(voice), acq.soundId);
  return acq.soundId;
}

/** UI beep helper: plays a registered ui asset if present, else a synthesized fallback beep. */
export function playUi(id?: AssetId, opts: OneShotOpts = {}): number | null {
  if (id && hasAsset(id)) return play2D(id, { category: "ui", ...opts });
  playBeep();
  return null;
}

/** Stop a one-shot (or any voice) by its Howler sound id. */
export function stop(soundId: number): void {
  VoiceManager.stopBySound(soundId);
}
