// Combat data contracts. Pure serializable POJOs + a couple of client-only event payloads that
// carry live entity refs (the in-process `combatEvents` bus is client-only and never networked).
// Re-exported from `index.ts` so consumers (ragdoll / vfx / audio / wanted) share these shapes.

import type { Vec3 } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";

/** Body region a shot landed in — drives the damage multiplier + ragdoll bone hint. */
export type Hitzone = "head" | "torso" | "limb";

/** Firing model. `hitscan` = Rapier/analytic ray; `projectile` = integrated ballistics; melee. */
export type FireMode = "hitscan" | "projectile" | "melee";

/** Who/what took the hit — mirrors wanted's `VictimKind` so the DOM crime bridge lines up. */
export type CombatVictimKind = "civilian" | "police" | "player" | "vehicle" | "prop";

/** Impact surface — structurally identical to vfx's `VfxSurface` (kept local to avoid coupling). */
export type CombatSurface =
  | "concrete"
  | "metal"
  | "wood"
  | "glass"
  | "water"
  | "flesh"
  | "sand"
  | "dirt"
  | "foliage";

/**
 * Per-entity firing runtime (ECS `combat_weapon`). Ammo itself is OWNED by inventory (store +
 * `inv_equipped`); this only holds the firing FSM + cadence so the same code can later drive AI
 * shooters. Serializable POJO.
 */
export interface CombatWeaponRuntime {
  /** The weapon id this runtime is bound to (detects mid-frame weapon switches). */
  weaponId: string;
  state: "ready" | "reloading";
  /** performance.now() of the last shot (fire-rate gate). */
  lastShotAt: number;
  /** performance.now() when an in-flight reload completes (0 when not reloading). */
  reloadEndsAt: number;
  /** Edge tracking for semi-auto (fire only on the trigger's rising edge). */
  triggerWasDown: boolean;
  /** Accumulated recoil bloom 0..1 (widens spread under sustained fire, decays when idle). */
  bloom: number;
}

/** Pooled ballistic projectile (ECS `combat_projectile`) — RPG rocket / thrown grenade. */
export interface CombatProjectile {
  weaponId: string;
  ownerNetId?: number;
  /** Velocity (m/s). */
  vx: number;
  vy: number;
  vz: number;
  /** Gravity accel applied per second (m/s², negative = down; 0 = flat/rocket). */
  gravity: number;
  /** Air drag per second (0..1 fraction retained). */
  drag: number;
  /** Direct-hit damage; AoE scales this by distance falloff inside `radius`. */
  damage: number;
  /** Area-of-effect radius (m); 0 = direct impact only. */
  radius: number;
  /** Ragdoll/knockback impulse magnitude passed on the death/damage event. */
  impulse: number;
  /** Previous position for the per-frame swept raycast (anti-tunneling). */
  px: number;
  py: number;
  pz: number;
  /** performance.now() at spawn (lifetime cap). */
  bornAt: number;
  /** Fuse in ms after which it detonates in-air (grenade); 0 = detonate on impact only (rocket). */
  fuseMs: number;
}

/** Practice-target bookkeeping (ECS `combat_target`) for the self-contained shooting range. */
export interface CombatTargetInfo {
  /** performance.now() when this target should respawn (0 = alive). */
  respawnAt: number;
  /** Home transform so a downed target can pop back up in place. */
  home: Vec3;
}

/** Normalised view of the equipped weapon (resolved from `inv_equipped` or the inventory store). */
export interface EquippedView {
  weaponId: string;
  /** Display name for the HUD (e.g. "9mm Pistol"). */
  name: string;
  isMelee: boolean;
  ammoType: string | null;
  /** Rounds currently in the magazine. */
  mag: number;
  magSize: number;
  /** Reserve rounds for this weapon's ammo pool. */
  reserve: number;
  /** True when a shot/swing is allowed right now (melee, or mag > 0). */
  canFire: boolean;
}

// ── Public event payloads (the shared `damage` / `death` signals) ──────────────────────────────

/** Emitted on every damaging hit. Consumed by vfx (blood/impact), audio, wanted, AI. */
export interface CombatDamageEvent {
  /** netId of the shooter (the player = 1 in v0). */
  attackerNetId?: number;
  /** netId of the victim, if it carries one. */
  victimNetId?: number;
  victimKind: CombatVictimKind;
  /** Live client entity that took the hit (client bus only — never serialized/networked). */
  target: ClientEntity;
  weaponId: string;
  /** Final damage applied after falloff + hit-zone multiplier. */
  amount: number;
  hitzone: Hitzone;
  headshot: boolean;
  /** True when this hit reduced the victim to 0 HP. */
  lethal: boolean;
  melee: boolean;
  /** Victim HP remaining after this hit. */
  remaining: number;
  /** World-space contact point. */
  point: Vec3;
  /** Surface normal at the contact (impacts/decals orient to this). */
  normal: Vec3;
  /** Unit shot direction (for knockback / ragdoll impulse). */
  dir: Vec3;
  /** Suggested ragdoll/knockback impulse magnitude. */
  impulse: number;
  surface: CombatSurface;
}

/** Emitted the frame a victim dies. Consumed by ragdoll (death), vfx, wanted, mission/score. */
export interface CombatDeathEvent {
  killerNetId?: number;
  victimNetId?: number;
  victimKind: CombatVictimKind;
  target: ClientEntity;
  weaponId: string;
  hitzone: Hitzone;
  melee: boolean;
  point: Vec3;
  /** Unit impulse direction (bullet travel) — ragdoll rigs fling along this. */
  dir: Vec3;
  impulse: number;
}

export type CombatEventMap = {
  damage: CombatDamageEvent;
  death: CombatDeathEvent;
};
