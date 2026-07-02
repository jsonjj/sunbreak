// audio/sound — SUNBREAK sound-design / SFX subsystem.
//
// The data-driven game-event -> sound catalog + dispatcher. It listens to shared ECS components
// (footsteps from `movement`, engine RPM from `vehicle`, damage from `health`) and to a shared
// event bus (gunfire/impacts/UI/vehicles/pickups/wanted/missions), and plays everything through
// the audio-engine backend (with a built-in Web Audio + procedural-synth fallback so it works
// standalone). Also owns the looping city ambience bed.
//
// Self-registers on import via `registerModule` — no central wiring. Own ONLY this folder.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

import "./sfx.components"; // ECS augmentation (declaration merging) — side-effect import

import { footstepSystem } from "./systems/footsteps";
import { engineAudioSystem } from "./systems/engineAudio";
import { impactSystem } from "./systems/impacts";
import { emitterSystem } from "./systems/emitters";
import { ambienceSystem } from "./systems/ambience";
import { listenerSyncSystem } from "./systems/listenerSync";
import { installEventListeners } from "./listeners";
import { primeAudioOnGesture } from "./runtime";

type W = typeof world;

export const sound: SubsystemModule<W> = {
  id: "audio/sound",
  systems: [
    footstepSystem, // update
    engineAudioSystem, // update
    impactSystem, // update
    emitterSystem, // update
    ambienceSystem, // update
    listenerSyncSystem, // render
  ],
  init() {
    const cleanups = [installEventListeners(), primeAudioOnGesture()];
    return () => {
      for (const c of cleanups) c();
    };
  },
};

registerModule(sound);

// ── Public API (for the integrator, the audio engine, and other subsystems) ──
export { sfxBus, emitSfx } from "./bus";
export type {
  SfxBusEvents,
  UiSfxKind,
  VehicleSfxKind,
  PickupSfxKind,
  ImpactMaterial,
} from "./bus";
export { playEvent, startLoop } from "./dispatch";
export { setSfxBackend, getBackend, resumeAudio } from "./runtime";
export { CATALOG, BUS_DEFAULTS } from "./catalog";
export type { SoundEventId, SfxEmitterSpec } from "./catalog";
export type {
  SfxBackend,
  VoiceHandle,
  PlayRequest,
  PlayOptions,
  SfxBus,
  SfxSurface,
  ClipDef,
  SynthSpec,
} from "./types";
