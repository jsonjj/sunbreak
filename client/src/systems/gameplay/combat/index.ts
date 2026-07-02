// gameplay/combat — weapons, hitscan + projectiles, damage model, shared damage/death events.
// Self-registers on import (the systems-loader eagerly imports this root index). Implements
// gta6-build/03-gameplay/combat-weapons.md under the Wave-2 protocol.
//
// Flow: read aim/fire/reload from the shared input snapshot → resolve the equipped weapon from
// inventory (`inv_equipped` / store) → gate by fire-rate + ammo + reload FSM → hitscan (Rapier +
// analytic capsule vs `stat_health` actors) or projectile → decrement the target's `stat_health`
// → emit the shared `damage`/`death` events that ragdoll + vfx + wanted consume.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

// Register ECS augmentations (own `combat_*` + the consumed `stat_health` seam) before systems.
import "./components";
import "./contracts";

import { fireSystem } from "./systems/fireSystem";
import { projectileSystem } from "./systems/projectileSystem";
import { targetSystem } from "./systems/targetSystem";
import { combatHudSyncSystem } from "./systems/hudSyncSystem";

type W = typeof world;

export const combat: SubsystemModule<W> = {
  id: "gameplay/combat",
  systems: [fireSystem, projectileSystem, targetSystem, combatHudSyncSystem],
};

registerModule(combat); // required side effect — makes combat live

// ── Public API (consumers + integrator) ─────────────────────────────────────────────────────────
/** The shared combat event bus. `combatEvents.on("damage" | "death", cb)`. */
export { combatEvents, onCombatDamage, onCombatDeath } from "./events";
export type {
  CombatDamageEvent,
  CombatDeathEvent,
  CombatEventMap,
  CombatVictimKind,
  Hitzone,
} from "./types";
/** Ballistics table (data-driven weapon feel), keyed by inventory weapon ids. */
export { COMBAT_WEAPONS, getCombatWeapon } from "./weapons";
export type { WeaponBallistics } from "./weapons";
/** INTEGRATOR: mount this once inside <PhysicsProvider> to enable world occlusion + VFX + range. */
export { CombatRig } from "./view/CombatRig";
