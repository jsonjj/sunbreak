// ECS augmentation for the radio subsystem. Adds `radio_`-prefixed components to the shared
// `SimComponents` interface via declaration merging (WAVE-2 contract). This file MUST keep a
// top-level import so it stays a MODULE and does not clobber the shared module.
import type { RadioReceiver } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Tuning state for an entity that can hear the radio (attached to the local listener). */
    radio_receiver?: RadioReceiver;
    /** Presence tag: the radio is currently audible for this entity (driver/occupant in-car). */
    radio_audible?: true;
  }
}

export type { RadioReceiver } from "./types";
