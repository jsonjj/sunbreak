// ECS augmentation for the VFX subsystem. Declaration-merged onto the shared `SimComponents`
// so gameplay systems can trigger effects by writing plain data onto entities — no direct
// coupling to the renderer. EVERY field is `vfx_`-prefixed and optional (Partial contract).
//
// This file is a module (it imports real types), so the `declare module` MERGES rather than
// replaces `@sunbreak/shared`. It is imported by ./index.ts so the augmentation is always in
// the client compilation.
import type { Vec3Tuple } from "@sunbreak/shared";
import type { VfxEvent, WeatherState } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Tags the entity that carries the VFX scene-graph container (`three` view component). */
    vfx_root?: true;

    /** One-shot event queue. Push `VfxEvent`s here from ANY system; the VFX render system
     *  drains + clears it every frame. This is the primary ECS trigger channel. */
    vfx_emit?: VfxEvent[];

    /** Global weather state the VFX system reads to drive rain + wetness (pull source). */
    vfx_weather?: WeatherState;
    /** Presence tag marking which entity owns authoritative weather (optional convenience). */
    vfx_weatherSource?: true;

    /** Continuous skid/tire-mark emitter. Vehicles set `active` + per-wheel contact points. */
    vfx_skid?: {
      active: boolean;
      points: Vec3Tuple[];
      width?: number;
      opacity?: number;
      smoke?: boolean;
    };

    /** Continuous exhaust puff emitter, followed to the entity transform each frame. */
    vfx_exhaust?: {
      offset: Vec3Tuple;
      rate?: number;
      color?: number;
      enabled?: boolean;
    };

    /** Generic looping ambient emitter attached to an entity (dust/smoke/fire/sparks). */
    vfx_emitter?: {
      kind: "dust" | "smoke" | "fire" | "sparks";
      offset?: Vec3Tuple;
      rate: number;
      enabled?: boolean;
      scale?: number;
      color?: number;
    };
  }
}
