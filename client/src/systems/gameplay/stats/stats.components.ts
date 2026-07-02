// ECS augmentation for the PLAYER STATS / HEALTH / DEATH subsystem (gameplay/stats).
//
// Declaration-merges the shared `SimComponents` interface with `stat_`-prefixed vitals fields
// so combat, peds, and any other subsystem can read/decrement them on ANY entity (player +
// NPCs) without importing this folder. Per the Wave-2 contract: every field is prefixed +
// optional (or a presence tag), and this file stays a MODULE (trailing `export {}`) so it
// augments rather than replaces `@sunbreak/shared`.
//
// `stat_health` is the canonical vitals blob combat/peds/ragdoll read + decrement (the shared
// `Health` shape `{current, max, armor}`). `stat_healthMax`/`stat_armor`/… mirror the scalar
// vitals stats owns for regen/persistence. INTEGRATOR NOTE: reconciled to `Health` (was `number`)
// so it matches combat/peds/ragdoll which already read `stat_health.current/.max/.armor`.

import type { Health } from "@sunbreak/shared";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Canonical vitals `{current, max, armor}`. THE blob combat + peds decrement. current 0 → death. */
    stat_health?: Health;
    /** Health ceiling (regen + full-heal cap). Default 100. */
    stat_healthMax?: number;
    /** Current armor. Absorbs incoming damage first; never regenerates. */
    stat_armor?: number;
    /** Armor ceiling (buy-vendor / pickup cap). Default 100. */
    stat_armorMax?: number;
    /** Current stamina. Drains while sprinting/swimming/climbing; recovers otherwise. */
    stat_stamina?: number;
    /** Stamina skill 0..100 → staminaMax = STAMINA_BASE + skill*1.5. */
    stat_staminaSkill?: number;
    /** Special-ability charge, 0..1. */
    stat_ability?: number;
    /** performance.now() ms of the last damage taken (gates out-of-combat regen). */
    stat_lastDamageAt?: number;

    // --- presence tags -------------------------------------------------------------------
    /** Opt-in: this entity regenerates health out of combat (player has it; peds usually don't). */
    stat_regen?: true;
    /** Vitals death marker (health hit 0). Peds subsystem consumes this to ragdoll/despawn. */
    stat_dead?: true;
    /** Player was arrested — respawns at a police station instead of a hospital. */
    stat_busted?: true;
  }
}

export {};
