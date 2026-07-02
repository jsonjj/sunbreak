// CONSUMED CROSS-SUBSYSTEM SEAM (declared here defensively) — `stat_health`.
//
// ⚠️ SEAM: `stat_health` is OWNED by the `gameplay/stats` subsystem (prefix `stat_`). It is the
// single canonical health component for any damageable actor: combat subtracts from it and
// death/ragdoll read it. Per the wave brief, combat "applies damage by decrementing the target's
// stat_health (owned by the stats subsystem)".
//
// During this parallel wave `gameplay/stats` is still a stub, so it hasn't declared the component
// yet. `gameplay/peds` ALSO declares this exact same seam defensively (see
// `systems/gameplay/peds/contracts.ts`). We mirror it here — IDENTICALLY, using the existing
// shared `Health` shape ({current,max,armor}) — so THIS folder stays self-consistently typed even
// in isolation. TypeScript declaration merging is additive: identical declarations across peds +
// combat merge with no error. If `gameplay/stats` later picks a DIFFERENT shape, the integrator
// reconciles these one-liners (see the report's "integrator wiring notes"). Kept isolated so that
// reconciliation is a trivial, obvious edit.

// A second consumed seam is `inv_reloading` — OWNED by `gameplay/inventory`, which declares it as
// `inv_reloading?: true` and documents it as "reserved for combat use" (combat sets it while a
// reload is in flight so animation/HUD can react). We mirror that IDENTICAL declaration here so
// combat can `world.addComponent(player, "inv_reloading", true)` in a well-typed way even in
// isolation; identical declaration merging means this is a no-op alongside inventory's.

import type { Health } from "@sunbreak/shared";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Canonical vitals for any damageable actor. Combat subtracts from `current`; ≤0 = dead. */
    stat_health?: Health;
    /** Presence tag set by combat while a reload is in flight (owned by gameplay/inventory). */
    inv_reloading?: true;
  }
}

export {};
