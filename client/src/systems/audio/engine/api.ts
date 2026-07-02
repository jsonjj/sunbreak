// The public audio API — the single "clean module" every other subsystem imports. Gameplay,
// Sound-Design, Radio and HUD/Settings call these; nothing reaches into the internals.
//
//   import { audio } from "@/systems/audio/engine";
//   audio.playSpatial("weapon_pistol", muzzleWorldPos, { priority: 90 });
//
// Individual functions are also exported for tree-shakeable named imports.
import type { SettingsState } from "@sunbreak/shared";
import {
  bootAudio,
  getQualityTier,
  getVoiceCap,
  initAudio,
  isAudioUnlocked,
  onAudioUnlock,
  playBeep,
  setHowlerGlobalGain,
  setQualityTier,
  usingWebAudio,
} from "./AudioEngine";
import { effVol, useMixer } from "./mixer/mixerStore";
import type { Category } from "./mixer/categories";
import { duck, restoreDuck } from "./mixer/ducking";
import { play2D, playSpatial, playUi, stop } from "./spatial/oneShot";
import { createEmitter, detachAllEmitters, emitterCount } from "./spatial/emitter";
import { getListenerPosition, setListener } from "./spatial/listener";
import { activeStreamCount, crossfadeStream, playStream, stopAllStreams } from "./stream/streamBus";
import { VoiceManager } from "./voices/VoiceManager";
import { SoundPool } from "./voices/SoundPool";
import {
  allAssets,
  getAsset,
  hasAsset,
  registerAsset,
  registerAssets,
  sources,
} from "./library/manifest";

/** Map the shared 4-channel settings (master/music/sfx/voice) onto the 9 mixer categories. */
export function applySettingsAudio(a: SettingsState["audio"]): void {
  const m = useMixer.getState();
  m.setMaster(a.master);
  m.setCategoryVolume("music", a.music);
  m.setCategoryVolume("radio", a.music);
  const sfx: Category[] = ["ambience", "vehicles", "weapons", "footsteps", "impacts", "ui"];
  for (const c of sfx) m.setCategoryVolume(c, a.sfx);
  m.setCategoryVolume("dialogue", a.voice);
}

/** The composed public API object. */
export const audio = {
  // lifecycle
  boot: bootAudio,
  init: initAudio,
  isUnlocked: isAudioUnlocked,
  onUnlock: onAudioUnlock,
  usingWebAudio,

  // quality / diagnostics
  setQuality: setQualityTier,
  getQuality: getQualityTier,
  voiceCap: getVoiceCap,
  activeVoices: (): number => VoiceManager.activeCount(),
  activeEmitters: emitterCount,
  activeStreams: activeStreamCount,

  // one-shots
  playSpatial,
  play2D,
  playUi,
  playBeep,
  stop,
  stopAll: (): void => VoiceManager.stopAll(),

  // looping emitters
  createEmitter,
  detachAllEmitters,

  // streaming (music/radio)
  playStream,
  crossfadeStream,
  stopStreams: stopAllStreams,

  // mixer
  mixer: useMixer,
  effVol,
  setMasterVolume: (v: number): void => useMixer.getState().setMaster(v),
  setCategoryVolume: (c: Category, v: number): void => useMixer.getState().setCategoryVolume(c, v),
  setMute: (c: Category, muted: boolean): void => useMixer.getState().setMute(c, muted),
  toggleMute: (c: Category): void => useMixer.getState().toggleMute(c),
  setSolo: (c: Category | null): void => useMixer.getState().setSolo(c),
  applySettingsAudio,

  // ducking (dialogue/phone)
  duck,
  restoreDuck,

  // listener authority
  setListener,
  getListenerPosition,

  // catalog
  registerAsset,
  registerAssets,
  getAsset,
  hasAsset,
  allAssets,
  audioSources: sources,
  warm: (ids: readonly string[]): void => SoundPool.warm(ids),

  // low-level escape hatch
  setHowlerGlobalGain,
};

export type AudioApi = typeof audio;

// ── Named re-exports (values) ────────────────────────────────────────────────
export {
  bootAudio,
  initAudio,
  isAudioUnlocked,
  onAudioUnlock,
  playBeep,
  setQualityTier,
  getVoiceCap,
  usingWebAudio,
} from "./AudioEngine";
export { useMixer, effVol } from "./mixer/mixerStore";
export {
  CATEGORIES,
  DEFAULT_CATEGORY_VOLUME,
  DEFAULT_PANNER,
  CATEGORY_VOICE_CAP,
  isCategory,
} from "./mixer/categories";
export { duck, restoreDuck } from "./mixer/ducking";
export { playSpatial, play2D, playUi, stop } from "./spatial/oneShot";
export { createEmitter } from "./spatial/emitter";
export { setListener, getListenerPosition, distanceToListener } from "./spatial/listener";
export { playStream, crossfadeStream, stopAllStreams } from "./stream/streamBus";
export { registerAsset, registerAssets, getAsset, hasAsset, allAssets, sources } from "./library/manifest";
export {
  FOOTSTEP_SPRITES,
  CASING_SPRITES,
  IMPACT_SPRITES,
  WHIZZ_SPRITES,
} from "./library/sprites";

// ── Named re-exports (types) ─────────────────────────────────────────────────
export type { Category, MixChannel, PanningModel } from "./mixer/categories";
export type { MixerState } from "./mixer/mixerStore";
export type { AssetId, AudioAsset, BuiltinAssetId } from "./library/manifest";
export type { OneShotOpts } from "./spatial/oneShot";
export type { EmitterHandle, PositionSource } from "./spatial/emitter";
export type { StreamHandle, StreamOptions } from "./stream/streamBus";
export type { QualityTier } from "@sunbreak/shared";
export type { AudioEmitter } from "./audio.components";
export type { Surface } from "./library/sprites";
