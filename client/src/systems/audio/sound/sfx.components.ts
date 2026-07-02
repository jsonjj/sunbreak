// ECS augmentation for the sound-design subsystem (prefix: `sfx_`).
//
// Per the Wave-2 contract we extend the shared `SimComponents` via declaration merging from
// INSIDE our own folder. All fields are optional / serializable POJOs. Live audio voice
// handles are NOT stored here — they live in module-level WeakMaps in the systems that own
// them (see systems/engineAudio.ts, systems/emitters.ts) so sim components stay serializable.
//
// NOTE: this file keeps a real `import` so it remains a MODULE (a bare `declare module` would
// silently replace `@sunbreak/shared` and break every shared type).

import type { SfxSurface } from "./types";
import type { SfxEmitterSpec } from "./catalog";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Surface the entity is standing on / was hit on — picks footstep + impact variants.
     *  Any subsystem (locomotion, terrain, weapons) may set this; defaults to concrete. */
    sfx_surface?: SfxSurface;

    /** Normalized engine load 0..1 that the engine-audio system derives from vehicle speed
     *  and publishes back onto the entity, so HUD/VFX can read a shared RPM signal. */
    sfx_engineRpm?: number;

    /** Declarative looping positional emitter. Give an entity this component and the SFX
     *  system spawns + tracks a looped voice to its transform (e.g. ambient point sources). */
    sfx_emitter?: SfxEmitterSpec;

    /** Presence tag — suppress ALL diegetic audio this subsystem would emit for the entity. */
    sfx_muted?: true;
  }
}
