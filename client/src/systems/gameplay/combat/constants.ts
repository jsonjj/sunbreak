// Combat tunables — feel/perf numbers live here so they're fast to iterate. No side effects.
// (Weapon-specific ballistics live in `weapons.ts`; these are subsystem-wide constants.)

/** Aim ray origin height above the player's body root when no camera is available (m). */
export const EYE_HEIGHT = 1.5;
/** Muzzle height above the body root — tracers/muzzle flash spawn here (cosmetic only). */
export const MUZZLE_HEIGHT = 1.15;
/** Small forward push so the muzzle sits in front of the body capsule (m). */
export const MUZZLE_FORWARD = 0.35;

// ── Hit registration (analytic capsule; peds have NO Rapier colliders) ────────────────────────
/** Humanoid hit capsule radius — forgiving hit-reg for a browser third-person shooter (m). */
export const HITBOX_RADIUS = 0.42;
/** Half-height of the hit capsule; centre is the entity `transform.position` (m). */
export const HITBOX_HALF_HEIGHT = 0.9;
/** Capsule-axis fraction (0 = feet, 1 = crown) above which a hit counts as a headshot. */
export const HEAD_BAND = 0.82;
/** Capsule-axis fraction below which a hit counts as a limb (reduced damage). */
export const LIMB_BAND = 0.3;

/** Fallback ray length when a weapon has no explicit range (m). */
export const DEFAULT_MAX_RANGE = 220;

/** Extra spread multiplier while moving (hip-fire penalty). */
export const MOVE_SPREAD_MULT = 1.5;
/** Speed (m/s) above which the player counts as "moving" for the hip-fire penalty. */
export const MOVE_SPREAD_SPEED = 0.6;

// ── Recoil (kick applied to the shared look angles, then recovered) ────────────────────────────
/** How much of the accumulated recoil is auto-recovered per second (fraction 0..1 of residual). */
export const RECOIL_RECOVER_FRACTION = 0.9;
/** Hard cap on total accumulated vertical recoil so sustained auto-fire can't spin the camera up. */
export const RECOIL_PITCH_CAP = 0.22; // radians (~12.5°)
/** Upper clamp on the look pitch while recoil is applied (mirrors InputManager's PITCH_MAX). */
export const RECOIL_PITCH_LIMIT = 1.1;
/** Bloom (recoil bloom) contribution to the reticle/hitscan spread cone, at bloom = 1 (deg). */
export const BLOOM_MAX_SPREAD_DEG = 4.5;
/** Bloom decay per second when not firing. */
export const BLOOM_DECAY_PER_S = 2.5;

// ── Reticle (crosshair reflects the live spread) ──────────────────────────────────────────────
/** Screen pixels of crosshair gap per degree of spread half-angle. */
export const RETICLE_PX_PER_DEG = 7;
/** Crosshair gap clamp (px) so it never fully collapses or explodes. */
export const RETICLE_MIN_GAP = 3;
export const RETICLE_MAX_GAP = 46;
/** Extra transient gap added the instant a shot goes off, then eased away (px). */
export const RETICLE_FIRE_KICK = 6;
/** Reticle fire-kick decay per second (px/s). */
export const RETICLE_KICK_DECAY = 60;

// ── Hit feedback (hitmarker + floating damage numbers, drawn by <CombatOverlay/>) ──────────────
export const HITMARKER_MS = 220;
export const DAMAGE_NUMBER_MS = 900;
/** Pool sizes for the DOM feedback overlay (recycled, hard-capped). */
export const DAMAGE_NUMBER_POOL = 20;
/** Rise distance for a floating damage number over its lifetime (px). */
export const DAMAGE_NUMBER_RISE = 46;

// ── World weapon pickups ──────────────────────────────────────────────────────────────────────
/** Collect radius for a walk-over weapon pickup (m). */
export const WEAPON_PICKUP_RADIUS = 1.6;
/** Default respawn delay for a pickup flagged to respawn (ms). */
export const WEAPON_PICKUP_RESPAWN_MS = 20000;
/** Proximity poll rate for the pickup system (Hz-equivalent; never per-frame). */
export const WEAPON_PICKUP_RATE = 1 / 10;

// ── Practice range (self-contained validation targets, spawned by <CombatRig/>) ────────────────
export const TARGET_COUNT = 6;
export const TARGET_HEALTH = 60;
export const TARGET_RESPAWN_MS = 3500;
/** Anchor of the practice-target row (world space) + spacing between targets (m). */
export const RANGE_ANCHOR = { x: 0, y: 0, z: -14 } as const;
export const RANGE_SPACING = 2.4;

// ── VFX pools (instanced, hard-capped, recycled) ──────────────────────────────────────────────
export const TRACER_POOL = 48;
export const IMPACT_POOL = 48;
export const TRACER_MS = 60;
export const MUZZLE_MS = 55;
export const IMPACT_MS = 260;

// ── Projectiles ───────────────────────────────────────────────────────────────────────────────
/** Hard cap on simultaneously live projectiles (pool + anti-tunneling sweep budget). */
export const PROJECTILE_CAP = 24;
/** Max projectile lifetime before auto-detonate/despawn (ms). */
export const PROJECTILE_MAX_LIFE_MS = 6000;

// ── HUD mirror cadence (finish phase; matches sibling sync systems) ────────────────────────────
export const HUD_SYNC_RATE = 1 / 12; // ~12 Hz
