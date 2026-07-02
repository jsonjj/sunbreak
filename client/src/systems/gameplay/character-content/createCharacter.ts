// THE public helper other subsystems use.
//
//     const cami = createCharacter("cami");                 // a lead
//     const cop  = createCharacter("police", { seed: 7 });  // a modular ped/police variant
//     scene.add(cami.object3D);                             // ready to render (feet origin, faces -Z)
//     // each frame: cami.setLocomotion(normalizedSpeed, grounded, mode); cami.update(dt)
//     // (or let this subsystem tick it via the ECS — see ./ecs/spawn.ts + ./ecs/systems.ts)
//
// Player, peds, and police all consume the SAME factory; only the Appearance differs.

import type {
  Appearance,
  CharacterInstance,
  CharacterKind,
  CharacterKindInput,
  CreateCharacterOptions,
} from "./types";
import { appearanceForArchetype, isPedKind } from "./modular/archetypes";
import { buildCharacter } from "./modular/characterFactory";
import { sharedMaterialCache } from "./modular/materialCache";
import { isLeadId, LEADS } from "./leads/leadDefs";
import { getClips } from "./rig/animationLibrary";
import { createAnimator } from "./rig/animator";
import { getTemplate } from "./rig/templates";

/** Normalize a kind (accepts shared enums, whose string values line up) to a CharacterKind. */
export function normalizeKind(kind: CharacterKindInput): CharacterKind {
  return String(kind) as CharacterKind;
}

/** Resolve the Appearance to build for a kind (explicit override > lead state > archetype seed). */
export function resolveAppearance(kind: CharacterKind, opts: CreateCharacterOptions = {}): Appearance {
  if (opts.appearance) return opts.appearance;
  if (isLeadId(kind)) {
    const def = LEADS[kind];
    const state = opts.wardrobeState ?? def.defaultState;
    return def.states[state] ?? def.states[def.defaultState]!;
  }
  if (isPedKind(kind)) return appearanceForArchetype(kind, opts.seed ?? 0);
  return appearanceForArchetype("civilian", opts.seed ?? 0);
}

/**
 * Build a rigged, animated humanoid ready to drop into the scene and drive via the animation system.
 * Returns an entity-ready `object3D` + `mixer` plus a crossfade/locomotion animator API.
 */
export function createCharacter(
  kind: CharacterKindInput,
  opts: CreateCharacterOptions = {},
): CharacterInstance {
  const k = normalizeKind(kind);
  const appearance = resolveAppearance(k, opts);
  const template = getTemplate(appearance.bodyId);
  const object3D = buildCharacter(template, appearance, sharedMaterialCache, opts.castShadow ?? true);
  const clips = getClips();
  const animator = createAnimator(object3D, clips);

  return {
    kind: k,
    appearance,
    object3D,
    mixer: animator.mixer,
    clips,
    actions: animator.actions,
    play: (state, fade) => animator.play(state, fade),
    setLocomotion: (n, grounded, mode) => animator.setLocomotion(n, grounded, mode),
    update: (dt) => animator.update(dt),
    setAbilityActive: (active, abilityId) => animator.setAbilityActive(active, abilityId),
    get current() {
      return animator.current;
    },
    dispose: () => animator.dispose(),
  };
}
