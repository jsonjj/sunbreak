// Public contract for the Character Content subsystem. Everything another subsystem
// (player, peds, police, animation, HUD) needs to consume characters lives here.
//
// Keep these serializable-friendly (string unions / POJOs) so `Appearance` can be stored
// on an ECS entity (char_appearance) and, later, network-synced or saved verbatim.

import type * as THREE from "three";
import type { CharacterId, LocomotionMode, PedArchetype } from "@sunbreak/shared";

/** Rig-template proportion id (all share ONE canonical skeleton; only mesh thickness varies). */
export type BodyId = "medium" | "slim" | "heavy";

/** Wardrobe slots that can be swapped/tinted. Head + hands ("skin") are a base, always-on part. */
export type Slot = "hair" | "torso" | "legs" | "feet" | "hat" | "accessory";

/** Which curated color a part tints from. Derived channels (clothingDark/shoe/accent) come off
 *  the base palette so a crowd still shares a tiny set of materials. */
export type PaletteChannel = "skin" | "hair" | "clothing" | "clothingDark" | "shoe" | "accent";

/** Curated palette keys (hex strings resolved from the curated tables at appearance-build time). */
export interface Palette {
  skin: string;
  hair: string;
  clothing: string;
}

/** Network- and save-serializable description of a humanoid's look. */
export interface Appearance {
  bodyId: BodyId;
  /** variantId per slot, or null = nothing worn in that slot. */
  wardrobe: Partial<Record<Slot, string | null>>;
  palette: Palette;
}

/** Lead abilities (visual hooks only; tuning owned by combat/driving). */
export type AbilityId = "focus" | "overdrive";

/** The playable leads. */
export type LeadId = "cami" | "mac";

/**
 * `createCharacter(kind)` accepts a lead id, a ped-archetype id, or the shared enums directly
 * (their string values line up: CharacterId.Cami === "cami", PedArchetype.Police === "police").
 */
export type CharacterKind = LeadId | "civilian" | "business" | "tourist" | "gangster" | "police";
export type CharacterKindInput = CharacterKind | CharacterId | PedArchetype;

/** Every clip in the shared animation library. Same names bind on every mixamorig rig. */
export type AnimState =
  | "Idle"
  | "Walk"
  | "Run"
  | "Sprint"
  | "CrouchIdle"
  | "CrouchWalk"
  | "Jump"
  | "Fall"
  | "TurnLeft"
  | "TurnRight"
  | "Aim"
  | "Wave";

/** The locomotion subset (chosen automatically from a speed scalar). */
export type LocomotionAnim = "Idle" | "Walk" | "Run" | "Sprint" | "Jump" | "Fall";

export interface CreateCharacterOptions {
  /** Deterministic variation seed for ped kinds (ignored for leads unless no state given). */
  seed?: number;
  /** Explicit appearance override (wins over kind-derived defaults). */
  appearance?: Appearance;
  /** For leads: which wardrobe state to wear (e.g. Cami "street"/"clinic"). */
  wardrobeState?: string;
  /** Cast shadows (default true). Turn off for distant crowd. */
  castShadow?: boolean;
}

/**
 * A ready-to-use character: an `object3D` you can drop into the scene (origin at the feet,
 * ~1.8m tall, faces -Z) and a `mixer` + `play`/`setLocomotion` for the animation system.
 */
export interface CharacterInstance {
  readonly kind: CharacterKind;
  readonly appearance: Appearance;
  readonly object3D: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: readonly THREE.AnimationClip[];
  readonly actions: Readonly<Record<string, THREE.AnimationAction | undefined>>;
  /** Crossfade to a state (no-op if already playing a looping state). */
  play(state: AnimState, fade?: number): void;
  /** Choose Idle/Walk/Run/Sprint/Fall from a 0..1 speed scalar + grounded/mode. */
  setLocomotion(normalizedSpeed: number, grounded?: boolean, mode?: LocomotionMode): void;
  /** Advance animation. Only call this if you are NOT letting the subsystem tick the mixer. */
  update(dt: number): void;
  /** Visual ability hook: bumps anim rate + flags postfx intent (tuning lives in combat/driving). */
  setAbilityActive(active: boolean, abilityId?: AbilityId): void;
  /** Currently playing state name. */
  readonly current: AnimState;
  /** Stop the mixer and release per-instance resources (shared geometry/materials are kept). */
  dispose(): void;
}
