// Public surface of the PEDESTRIAN AI subsystem. Other subsystems import from here (or the folder
// index), and — for zero-import decoupling during the wave — everything is also mirrored onto
// `window.__SUNBREAK_PEDS__` by installPedGlobal().

import type { ClientEntity } from "@/ecs/clientEntity";
import { getPedsNear, nearestPed } from "./spatialHash";
import {
  applyThreat,
  pedThreatBus,
  raiseThreat,
  reportDamageEvent,
} from "./perception";
import { killPed, type KillOptions } from "./behavior";
import { setPedVehicleProvider } from "./movement";
import { getNav, setPedNavProvider, setPedRoadGraph, useFallbackGrid } from "./nav";
import { getRenderRoot } from "./render/pedInstances";
import { lodStats } from "./lod";
import { pedQuery } from "./queries";

/** Number of live peds (includes dead-but-lingering). */
export const pedCount = (): number => pedQuery.entities.length;

/**
 * Reduce a ped's `stat_health` and react. Convenience for combat that would rather delegate the
 * vitals bookkeeping to peds. Returns true if the hit was lethal. (Combat may instead write
 * `stat_health` directly / set `isDead` — behaviour.ts detects either.)
 */
export function applyPedDamage(
  e: ClientEntity,
  amount: number,
  opts?: KillOptions,
): boolean {
  const a = e.ped_agent;
  const hp = e.stat_health;
  if (!a || a.state === "dead" || !hp) return false;
  const toArmor = Math.min(hp.armor, amount);
  hp.armor -= toArmor;
  hp.current = Math.max(0, hp.current - (amount - toArmor));
  const t = e.transform!;
  // Any hit is a strong local threat so survivors flee.
  raiseThreat("gunshot", t.position.x, t.position.z, { intensity: 1.2 });
  if (hp.current <= 0) {
    killPed(e, opts);
    return true;
  }
  return false;
}

/** Everything the peds subsystem exposes to siblings + the integrator. */
export const pedsApi = {
  // queries
  getPedsNear,
  nearestPed,
  pedCount,
  lodStats,
  // reactions / damage ingress
  applyThreat,
  raiseThreat,
  reportDamageEvent,
  applyPedDamage,
  killPed,
  pedThreatBus,
  // nav injection (consume the city road-graph via shared data)
  setPedRoadGraph,
  setPedNavProvider,
  useFallbackGrid,
  getNav,
  // traffic hookup
  setPedVehicleProvider,
  // rendering
  getRenderRoot,
} as const;

export type PedsApi = typeof pedsApi;

let installed = false;

/** Publish `window.__SUNBREAK_PEDS__` so decoupled subsystems can find peds without importing. */
export function installPedGlobal(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  (window as unknown as { __SUNBREAK_PEDS__?: PedsApi }).__SUNBREAK_PEDS__ = pedsApi;
  installed = true;
  return () => {
    if (typeof window !== "undefined") {
      delete (window as unknown as { __SUNBREAK_PEDS__?: PedsApi }).__SUNBREAK_PEDS__;
    }
    installed = false;
  };
}
