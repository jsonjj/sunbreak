// Fail-state evaluation. Returns the first triggered FailState (or null). `timerExpired` is
// owned by the runtime's countdown, so it's skipped here.

import type { FailState } from "./schema";
import type { MissionCtx } from "./types";
import { firstSpawn, isAlive } from "./queries";
import { getFailPredicate } from "./registries";
import { withinXZ } from "./util";

/**
 * @param spawnedRefs refs that have been spawned this run, so "protected/vehicle died" only fires
 *   after the entity actually existed (avoids an instant fail before onEnter spawns it).
 */
export function evalFailStates(
  list: readonly FailState[],
  ctx: MissionCtx,
  missionRef: string,
  spawnedRefs: Set<string>,
): FailState | null {
  for (const f of list) {
    switch (f.kind) {
      case "playerDied":
        if (ctx.player.exists() && ctx.player.health() <= 0) return f;
        break;
      case "protectedDied":
        if (spawnedRefs.has(f.entityRef)) {
          const e = firstSpawn(missionRef, f.entityRef);
          if (!e || !isAlive(e)) return f;
        }
        break;
      case "vehicleDestroyed":
        if (spawnedRefs.has(f.entityRef)) {
          const e = firstSpawn(missionRef, f.entityRef);
          if (!e || !isAlive(e)) return f;
        }
        break;
      case "leftArea":
        if (!withinXZ(ctx.player.position(), f.position, f.radius)) return f;
        break;
      case "wantedAtLeast":
        if (ctx.wanted.stars() >= f.stars) return f;
        break;
      case "predicate": {
        const fn = getFailPredicate(f.id);
        if (fn && fn(ctx)) return f;
        break;
      }
      case "timerExpired":
        // Handled by the runtime's stage timer.
        break;
    }
  }
  return null;
}

export function failReason(f: FailState): string {
  switch (f.kind) {
    case "playerDied":
      return "You died";
    case "protectedDied":
      return "Your ward was killed";
    case "vehicleDestroyed":
      return "The vehicle was destroyed";
    case "timerExpired":
      return "Out of time";
    case "leftArea":
      return "You left the mission area";
    case "wantedAtLeast":
      return "Too much heat";
    case "predicate":
      return "Mission failed";
  }
}
