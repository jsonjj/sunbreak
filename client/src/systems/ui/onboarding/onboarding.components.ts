// ECS augmentation for the ui/onboarding subsystem.
//
// Per the Wave-2 ECS contract (shared/src/ecs/components.ts): we augment `SimComponents`
// from OUR OWN file via declaration merging, prefix every field with `onb_`, keep fields
// optional (or presence-tags), and keep this a real module (the `import type` below).
//
// These components describe the disposable props the "First Gear" intro slice spawns into
// the world (a drive waypoint + breakable can targets). They carry only serializable POJO
// data; the meshes are rendered through the ECS↔R3F bridge by our CanvasLayer, reusing the
// shared `three` view component — we never hand-mount into App/Scene.
import type { Vec3 } from "@sunbreak/shared";

/** A distance-triggered waypoint the runner watches the player against. */
export interface OnbMarker {
  /** Stable id emitted as `zone:enter` when the player crosses it. */
  id: string;
  /** World-space centre of the trigger. */
  center: Vec3;
  /** Trigger radius in metres. */
  radius: number;
  /** i18n key for an optional floating label. */
  labelKey?: string;
}

/** A breakable target for the shooting drill. */
export interface OnbTarget {
  /** Stable id emitted as `combat:hitTarget` when destroyed. */
  id: string;
}

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Intro-slice grouping tag — everything spawned by onboarding carries it for cleanup. */
    onb_intro?: true;
    /** Drive/objective waypoint (Beat 3). */
    onb_marker?: OnbMarker;
    /** Breakable can target (Beat 4). */
    onb_target?: OnbTarget;
    /** Set on a target the instant it is destroyed (drives the despawn + hit count). */
    onb_hit?: true;
  }
}
