// ECS augmentation for the missions subsystem (WAVE-2 declaration-merging contract).
//
// Every field is prefixed `mission_` to avoid collisions with the ~36 other subsystems, and
// every field is optional / a presence-tag because entities only ever hold a Partial of these.
// The `import type` below keeps this file a real module (a bare `declare module` would REPLACE
// the shared module and break every type in the app).

import type { Vec3 } from "@sunbreak/shared";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Unique per-run mission id ("<missionId>#<seq>"). The cleanup sweep removes every
     *  entity carrying the ending run's ref, so replays never leak entities. */
    mission_ref?: string;
    /** Designer-facing spawn group ref (e.g. "goons", "getaway") used to target objectives. */
    mission_spawnRef?: string;
    mission_role?: "enemy" | "vehicle" | "prop" | "marker";

    // Enemy spawns (consumed by AI/combat once those subsystems land).
    mission_enemy?: true;
    mission_behavior?: "guard" | "patrol" | "attack";
    mission_weapon?: string;
    mission_patrolTarget?: Vec3;

    // Vehicle / prop spawns (consumed by vehicle + render subsystems).
    mission_vehicleModel?: string;
    mission_heading?: number;
    mission_propModel?: string;

    // Collectible props (picked up by the `collect` objective).
    mission_collectRef?: string;

    // World markers (an optional 3D-beacon render bridge can query these).
    mission_marker?: true;
    mission_markerKind?: "objective" | "waypoint" | "start";
    mission_markerColor?: string;
    mission_markerLabel?: string;
    mission_objectiveId?: string;

    // Interaction target id (matched by the `interact` objective / trigger).
    mission_targetId?: string;

    /** Stage index this entity was spawned in (used by checkpoint cleanup). */
    mission_spawnedAtStage?: number;
  }
}

export {};
