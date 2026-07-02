// ─────────────────────────────────────────────────────────────────────────────
// ECS augmentation for ai/dynamic-content — prefix: dyn_
// ─────────────────────────────────────────────────────────────────────────────
// Declaration-merges this subsystem's components into the shared SimComponents so
// they flow through SimEntity -> ClientEntity automatically. Every field is
// prefixed `dyn_` to avoid collisions with the other ~36 subsystems, and every
// field is optional or a presence tag (entities hold only a Partial).
//
// The `import type` keeps this file a real module (so `declare module` augments,
// never replaces, the shared types).

import type { Speaker } from "./canon";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** The ambient one-liner an entity (usually a ped) is currently "saying".
     *  Set by the bark director from the pre-warmed pool; rendered by ped /
     *  dialogue-ui subsystems that watch `world.with("dyn_barkText")`. */
    dyn_barkText?: string;
    /** Epoch ms when the current bark should be cleared. */
    dyn_barkUntil?: number;
    /** Epoch ms before this entity is allowed to bark again (anti-spam). */
    dyn_barkCooldownUntil?: number;
    /** Who is speaking, for styling the bubble / picking a voice. */
    dyn_barkSpeaker?: Speaker;

    /** Id (into the missions pool) of a contract this entity offers as a giver. */
    dyn_missionOfferId?: string;
    /** Id (into the sidequests pool) of a vignette this entity offers. */
    dyn_sidequestOfferId?: string;
  }
}
