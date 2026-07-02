// gameplay/character-content — rigged CC0 humanoids (shared Mixamo rig) for the player, peds &
// police, plus the two leads (Cami & Mac) and a modular ped variant system.
//
// Self-registers two render-phase systems (drive + mixer tick) via registerModule. Public API for
// other subsystems is re-exported at the bottom — most importantly `createCharacter(kind)`.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./char.components";
import { installCharacterLifecycle } from "./ecs/spawn";
import { characterSystems } from "./ecs/systems";
import { preloadClips } from "./rig/animationLibrary";
import { preloadCharacterAssets } from "./rig/assetSources";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "gameplay/character-content",
  systems: [...characterSystems],
  init() {
    preloadClips(); // warm the procedural clip cache
    const disposeLifecycle = installCharacterLifecycle();
    void preloadCharacterAssets(); // best-effort vendored CC0 GLBs; procedural fallback otherwise
    return () => {
      disposeLifecycle();
    };
  },
};

registerModule(mod); // required side effect — makes the subsystem run

// ── Public API (consumed by player, peds, police, animation, HUD, switching) ─────────────────────
export { createCharacter, normalizeKind, resolveAppearance } from "./createCharacter";
export { CharacterView } from "./ecs/CharacterView";
export {
  attachCharacter,
  detachCharacter,
  getCharacterInstance,
  installCharacterLifecycle,
  spawnCharacterEntity,
} from "./ecs/spawn";
export { characterSystems } from "./ecs/systems";
export { CAMI, MAC, LEADS, getLeadDef, isLeadId } from "./leads/leadDefs";
export type { LeadDef } from "./leads/leadDefs";
export { appearanceForArchetype, isPedKind } from "./modular/archetypes";
export type { PedKind } from "./modular/archetypes";
export { sharedMaterialCache, MaterialCache } from "./modular/materialCache";
export { SLOTS, SLOT_VARIANTS, partName } from "./modular/wardrobe";
export { getClips, registerExternalClips } from "./rig/animationLibrary";
export { ATTRIBUTION, preloadCharacterAssets } from "./rig/assetSources";
export { BONE, BONE_NAMES, SLOT_ANCHORS } from "./rig/skeleton";
export type {
  AbilityId,
  AnimState,
  Appearance,
  BodyId,
  CharacterInstance,
  CharacterKind,
  CharacterKindInput,
  CreateCharacterOptions,
  LeadId,
  LocomotionAnim,
  Palette,
  PaletteChannel,
  Slot,
} from "./types";
