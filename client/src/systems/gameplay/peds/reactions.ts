// Threat REACTIONS: state entry + destination selection for fleeing/panicking/cowering peds.
// The behaviour FSM (behavior.ts) decides WHEN to react (from `fear`); this module decides WHERE
// to run. Kept separate so flee routing can evolve independently of the FSM.

import type { ClientEntity } from "@/ecs/clientEntity";
import { CALM_COOLDOWN_S, CALM_THRESHOLD, PANIC_THRESHOLD } from "./config";
import { fleeNeighbor, getNav } from "./nav";
import type { PedAgent } from "./types";

const p = { x: 0, z: 0 };

/** Point an agent at a graph node (updates target + cached world destination). */
export function setAgentTarget(a: PedAgent, node: number): void {
  a.target = node;
  if (node < 0) return;
  getNav().nodePos(node, p);
  a.destX = p.x;
  a.destZ = p.z;
}

/** Snap the agent's `node` to whatever graph node it's currently closest to. */
export function resnapNode(a: PedAgent, x: number, z: number): void {
  const n = getNav().nearestNode(x, z);
  if (n >= 0) a.node = n;
}

/** Enter flee (or panic) and immediately pick a destination away from the threat. */
export function enterFlee(e: ClientEntity): void {
  const a = e.ped_agent!;
  const t = e.transform!;
  a.state = a.fear >= PANIC_THRESHOLD ? "panic" : "flee";
  a.calmCooldown = CALM_COOLDOWN_S;
  a.stateT = 0;
  resnapNode(a, t.position.x, t.position.z);
  refreshFleeTarget(e);
}

/** Re-pick the flee destination (called on arrival, or when the FSM refreshes flee routing). */
export function refreshFleeTarget(e: ClientEntity): void {
  const a = e.ped_agent!;
  const next = fleeNeighbor(a.node, a.fleeX, a.fleeZ);
  if (next < 0) {
    enterCower(e);
    return;
  }
  setAgentTarget(a, next);
}

/** No escape route — hunker down in place (fear still decays and can release later). */
export function enterCower(e: ClientEntity): void {
  const a = e.ped_agent!;
  a.state = "cower";
  a.target = -1;
  a.stateT = 0;
}

/**
 * If a fleeing/cowering ped has calmed (fear low + cooldown elapsed), return true so the FSM can
 * resume wandering. Panic won't release until fear falls under the flee floor.
 */
export function shouldCalm(a: PedAgent): boolean {
  return a.calmCooldown <= 0 && a.fear < CALM_THRESHOLD;
}
