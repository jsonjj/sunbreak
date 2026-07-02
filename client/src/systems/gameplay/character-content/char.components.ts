// ECS augmentation for the Character Content subsystem (prefix: char_). Declaration-merged into the
// shared SimComponents from inside this folder — never edit shared/**. All fields are optional or
// presence tags, and serializable POJOs (live THREE refs use the `three`/`mixer` VIEW components).

import type { Appearance, CharacterKind } from "./types"; // real import keeps this a module

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** What this humanoid is (lead id or ped archetype). Also our render/anim query marker. */
    char_kind?: CharacterKind;
    /** Serializable look (body, wardrobe, palette) — save/network-ready. */
    char_appearance?: Appearance;
    /** Mirror of the currently-playing animation state (for HUD/debug). */
    char_anim?: string;
    /** Deterministic ped variant seed. */
    char_seed?: number;
    /** Presence tag: this entity is a playable lead. */
    char_isLead?: true;
    /** Presence tag: model + mixer have been attached (three/mixer set). */
    char_ready?: true;
    /** Vertical offset applied when syncing the (feet-origin) model to entity.transform.
     *  e.g. a capsule-centered player entity uses -(halfHeight+radius). */
    char_yOffset?: number;
    /** Optional explicit facing yaw (radians) if the entity has no movement/rotation to read. */
    char_faceYaw?: number;
  }
}

export {};
