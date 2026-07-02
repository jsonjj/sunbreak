// audio/engine (client) — the shared runtime audio layer for SUNBREAK.
//
// Provides: a category mixer (persisted volumes, mute/solo, ducking), 3D positional one-shots,
// looping ECS emitters, HTML5 music/radio streaming, and a global pooling + voice-cap system on
// top of Howler v2 (WebAudio, built-in spatial). The listener follows the camera/player via ECS
// (see systems/listenerSystem.ts). Sound-Design, Radio and gameplay consume `audio` from here.
//
// Self-registers via `registerModule` (WAVE-2 contract). No central files are touched.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import type { world } from "@/ecs/world";

// Side-effect import: keeps the `audio_*` ECS augmentation in the program.
import "./audio.components";

import { bootAudio } from "./AudioEngine";
import { initVoiceManager } from "./voices/VoiceManager";
import { initStreamBus } from "./stream/streamBus";
import { startEmitterRuntime } from "./spatial/emitter";
import { listenerSystem } from "./systems/listenerSystem";
import { emitterSystem } from "./systems/emitterSystem";

type W = typeof world;

let stopEmitters: (() => void) | undefined;

export const mod: SubsystemModule<W> = {
  id: "audio/engine",
  systems: [listenerSystem, emitterSystem],
  init() {
    bootAudio(); // Howler flags + first-gesture unlock
    initVoiceManager(); // subscribe voices to mixer changes
    initStreamBus(); // subscribe streams to mixer changes
    stopEmitters = startEmitterRuntime(); // bind ECS audio_emitter entities
    return () => {
      stopEmitters?.();
      stopEmitters = undefined;
    };
  },
};

registerModule(mod);

// Public surface.
export * from "./api";
export { useAudio } from "./react/useAudio";
export type { UseAudio } from "./react/useAudio";
export { AudioListenerRig } from "./react/AudioListenerRig";
export type { AudioListenerRigProps } from "./react/AudioListenerRig";
