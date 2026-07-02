// SHARED CROSS-SUBSYSTEM CONTRACT (declared here defensively) — `stat_health`.
//
// ⚠️ SEAM: `stat_health` is conceptually OWNED by the `gameplay/stats` subsystem (prefix
// `stat_`). SUNBREAK's Wave-2 plan gives every damageable actor a single canonical health
// component that combat writes and death/ragdoll reads. Peds must carry it so combat can kill
// them — but during this parallel wave `stats` is still a stub, so nothing has declared it yet.
//
// To keep THIS folder self-consistently typed (and to make peds actually killable), we
// declaration-merge `stat_health` here using the existing shared `Health` shape (`{current,
// max, armor}`) — the most likely canonical form (it already lives in `@sunbreak/shared`).
//
// Declaration merging is additive: if `gameplay/stats` later declares `stat_health?: Health`
// identically, TypeScript merges the two with no error. If stats picks a DIFFERENT shape, the
// integrator reconciles this one-liner (see the report's "integrator wiring notes"). We keep it
// isolated in its own file precisely so that reconciliation is a trivial, obvious edit.

import type { Health } from "@sunbreak/shared";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Canonical vitals for any damageable actor. Combat subtracts from `current`; ≤0 = dead. */
    stat_health?: Health;
  }
}

export {};
