// Global voice budget manager. Every playing instance (one-shot or looping emitter) holds a
// Voice slot. Requests are checked against the global cap (quality-tiered) and the per-category
// cap; when full, the weakest voice (lowest priority, then a distant one-shot) is stolen. On any
// mixer change, every live voice re-reads its effective volume.
import type { Howl } from "howler";
import { CATEGORY_VOICE_CAP, type Category } from "../mixer/categories";
import { getVoiceCap } from "../AudioEngine";
import { useMixer } from "../mixer/mixerStore";
import { SoundPool } from "./SoundPool";
import { distanceSqToListener } from "../spatial/listener";
import type { AssetId } from "../library/manifest";

export type VoiceKind = "oneshot" | "loop";
export type PositionGetter = () => readonly [number, number, number] | null;

export interface VoiceRequest {
  category: Category;
  priority: number;
  kind: VoiceKind;
  /** Optional live position, used for distance-based stealing decisions. */
  getPos?: PositionGetter;
}

export interface Voice {
  readonly vid: number;
  category: Category;
  priority: number;
  kind: VoiceKind;
  getPos?: PositionGetter;
  asset: AssetId;
  howl: Howl | null;
  soundId: number;
  base: number;
  released: boolean;
}

let seq = 0;
let subscribed = false;
const voices: Voice[] = [];
const bySound = new Map<number, Voice>();

function categoryCount(category: Category): number {
  let n = 0;
  for (const v of voices) if (v.category === category) n++;
  return n;
}

function voiceDistanceSq(v: Voice): number {
  const p = v.getPos?.();
  return p ? distanceSqToListener(p) : 0;
}

function removeFromLists(v: Voice): void {
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
  if (v.soundId >= 0) bySound.delete(v.soundId);
}

/** Pick the weakest steal target among `pool` whose priority does not exceed `reqPriority`. */
function weakest(pool: readonly Voice[], reqPriority: number): Voice | null {
  let victim: Voice | null = null;
  for (const v of pool) {
    if (v.priority > reqPriority) continue; // never steal something more important
    if (!victim) {
      victim = v;
      continue;
    }
    if (v.priority < victim.priority) {
      victim = v;
      continue;
    }
    if (v.priority === victim.priority) {
      const vLoop = v.kind === "loop" ? 1 : 0;
      const victimLoop = victim.kind === "loop" ? 1 : 0;
      if (vLoop < victimLoop) victim = v; // steal one-shots before loops
      else if (vLoop === victimLoop && voiceDistanceSq(v) > voiceDistanceSq(victim)) victim = v;
    }
  }
  return victim;
}

export const VoiceManager = {
  /** Reserve a voice slot (stealing if necessary). Returns null when dropped (over budget). */
  request(req: VoiceRequest): Voice | null {
    const globalCap = getVoiceCap();
    const catCap = CATEGORY_VOICE_CAP[req.category] ?? globalCap;

    if (categoryCount(req.category) >= catCap) {
      const victim = weakest(
        voices.filter((v) => v.category === req.category),
        req.priority,
      );
      if (!victim) return null;
      VoiceManager.stop(victim);
    }

    if (voices.length >= globalCap) {
      const victim = weakest(voices, req.priority);
      if (!victim) return null;
      VoiceManager.stop(victim);
    }

    const v: Voice = {
      vid: ++seq,
      category: req.category,
      priority: req.priority,
      kind: req.kind,
      getPos: req.getPos,
      asset: "",
      howl: null,
      soundId: -1,
      base: 1,
      released: false,
    };
    voices.push(v);
    return v;
  },

  /** Attach the acquired sound to a reserved voice and apply its initial volume. */
  commit(v: Voice, howl: Howl, soundId: number, asset: AssetId, base: number): Voice {
    v.howl = howl;
    v.soundId = soundId;
    v.asset = asset;
    v.base = base;
    bySound.set(soundId, v);
    howl.volume(useMixer.getState().effVol(v.category, base), soundId);
    return v;
  },

  /** Drop a reserved voice whose sound acquisition failed (never played). */
  cancel(v: Voice): void {
    if (v.released) return;
    v.released = true;
    removeFromLists(v);
  },

  /** Free a voice whose sound ended naturally (does not stop anything). */
  release(v: Voice): void {
    if (v.released) return;
    v.released = true;
    if (v.howl && v.soundId >= 0) SoundPool.release(v.asset, v.soundId);
    removeFromLists(v);
  },

  /** Stop a voice's sound and free it (manual stop / voice stealing). */
  stop(v: Voice): void {
    if (v.released) return;
    v.released = true;
    if (v.howl && v.soundId >= 0) SoundPool.stop(v.asset, v.soundId);
    removeFromLists(v);
  },

  stopBySound(soundId: number): void {
    const v = bySound.get(soundId);
    if (v) VoiceManager.stop(v);
  },

  getBySound(soundId: number): Voice | undefined {
    return bySound.get(soundId);
  },

  /** Re-apply effective volumes to every live voice (called on mixer changes). */
  reapplyVolumes(): void {
    const eff = useMixer.getState().effVol;
    for (const v of voices) if (v.howl && v.soundId >= 0) v.howl.volume(eff(v.category, v.base), v.soundId);
  },

  stopAll(): void {
    for (const v of [...voices]) VoiceManager.stop(v);
  },

  activeCount(): number {
    return voices.length;
  },

  categoryCount,
};

/** Subscribe the manager to mixer changes so volume edits propagate live. Idempotent. */
export function initVoiceManager(): void {
  if (subscribed) return;
  subscribed = true;
  useMixer.subscribe(() => VoiceManager.reapplyVolumes());
}
