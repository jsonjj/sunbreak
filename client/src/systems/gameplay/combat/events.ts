// The shared combat `damage` / `death` signals. Combat is the PRODUCER; it exposes them three
// ways so every consumer can pick its preferred, decoupled channel:
//
//   1. `combatEvents` — a typed mitt bus (rich payload w/ the live entity ref). Ragdoll + vfx +
//      audio + AI do `import { combatEvents } from "@/systems/gameplay/combat"` and subscribe.
//   2. DOM CustomEvents `sunbreak:damage` / `sunbreak:death` — the exact seam the wanted
//      subsystem's crime bus ALREADY listens for (`crimeBus.ts` → reportDamage/reportDeath).
//      Import-free, load-order independent: if wanted isn't mounted the dispatch is a harmless
//      no-op. This is how "wanted consumes the damage/death event" with zero coupling.
//   3. ECS truth — combat decrements `stat_health` + tags `isDead`; peds' behaviour + the ragdoll
//      subsystem read that directly.
//
// `mitt` is a pre-installed dep (used by inventory/wanted/map/onboarding too).

import mitt from "mitt";
import type { Emitter } from "mitt";
import type { CombatDamageEvent, CombatDeathEvent, CombatEventMap } from "./types";

/** The public combat event bus. Subscribe with `combatEvents.on("damage" | "death", cb)`. */
export const combatEvents: Emitter<CombatEventMap> = mitt<CombatEventMap>();

/** Convenience subscribers that return an unsubscribe fn (nice for React effects). */
export function onCombatDamage(cb: (e: CombatDamageEvent) => void): () => void {
  combatEvents.on("damage", cb);
  return () => combatEvents.off("damage", cb);
}
export function onCombatDeath(cb: (e: CombatDeathEvent) => void): () => void {
  combatEvents.on("death", cb);
  return () => combatEvents.off("death", cb);
}

// ── DOM bridge to wanted (matches `wanted/types.ts` DamageEvent / DeathEvent detail shapes) ─────
const hasWindow = typeof window !== "undefined";

/** Emit a damage signal on the bus AND to the wanted DOM seam. */
export function emitDamage(e: CombatDamageEvent): void {
  combatEvents.emit("damage", e);
  if (!hasWindow) return;
  window.dispatchEvent(
    new CustomEvent("sunbreak:damage", {
      detail: {
        attackerNetId: e.attackerNetId,
        victimNetId: e.victimNetId,
        victimKind: e.victimKind,
        amount: e.amount,
        position: { x: e.point.x, y: e.point.y, z: e.point.z },
        weapon: e.weaponId,
        melee: e.melee,
      },
    }),
  );
}

/** Emit a death signal on the bus AND to the wanted DOM seam. */
export function emitDeath(e: CombatDeathEvent): void {
  combatEvents.emit("death", e);
  if (!hasWindow) return;
  window.dispatchEvent(
    new CustomEvent("sunbreak:death", {
      detail: {
        killerNetId: e.killerNetId,
        victimNetId: e.victimNetId,
        victimKind: e.victimKind,
        position: { x: e.point.x, y: e.point.y, z: e.point.z },
        weapon: e.weaponId,
      },
    }),
  );
}
