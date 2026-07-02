// ─────────────────────────────────────────────────────────────────────────────
// ECS AUGMENTATION — gameplay/daynight (prefix: time_)
// ─────────────────────────────────────────────────────────────────────────────
// Adds this subsystem's components to the shared `SimComponents` via declaration
// merging. A real import from "@sunbreak/shared" keeps this file a MODULE (so the
// augmentation MERGES rather than replacing the shared module). Never edit the
// shared file itself.

import type { Vec3 } from "@sunbreak/shared";
import type { EnvSnapshot, EnvEffects, EnvControlState } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Presence tag marking THE single authoritative environment entity. Query: `world.with("time_singleton")`. */
    time_singleton?: true;
    /** Full per-frame environment snapshot (time-of-day + weather). Primary read target. */
    time_env?: EnvSnapshot;
    /** Derived gameplay multipliers/flags (density, grip, fog, hazards). Read target for AI/physics. */
    time_effects?: EnvEffects;
    /** Control surface (pause / locks / time-scale / forecast override). */
    time_control?: EnvControlState;
  }
}

/** Re-export of the sun-direction shape (also keeps the shared import "used"). */
export type EnvSunDir = Vec3;
