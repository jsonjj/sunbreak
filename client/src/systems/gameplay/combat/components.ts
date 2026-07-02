// ECS augmentation — COMBAT's own components (prefix `combat_`).
//
// Declaration-merges the shared `SimComponents` interface from INSIDE this subsystem's folder
// (Wave-2 contract). All fields are optional / presence-tags and prefixed `combat_` to avoid
// collisions with sibling subsystems. The `import type` below keeps this file a MODULE (a bare
// `declare module` with no import/export would silently REPLACE the shared module and break its
// types). Never edit the shared file itself.

import type {
  CombatProjectile,
  CombatTargetInfo,
  CombatWeaponPickup,
  CombatWeaponRuntime,
} from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Per-entity firing FSM + cadence (player now; AI shooters later). Ammo lives in inventory. */
    combat_weapon?: CombatWeaponRuntime;

    /** Presence tag: a combat-owned entity that hitscan/AoE may damage (e.g. practice targets). */
    combat_hittable?: true;

    /** Practice-range target metadata (respawn timer + home transform). */
    combat_target?: CombatTargetInfo;

    /** Pooled ballistic projectile runtime (RPG rocket / thrown grenade). */
    combat_projectile?: CombatProjectile;

    /** World weapon pickup (grants a weapon + ammo on contact). */
    combat_weaponPickup?: CombatWeaponPickup;

    /** performance.now() at which combat killed this entity (drives cleanup / target respawn). */
    combat_deadAt?: number;
  }
}

export {}; // ensure module status even if the import is ever tree-shaken
