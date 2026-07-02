// Ped behaviour FSM: idle → wander → (flee → panic | cower) → back to wander, plus DEATH
// detection + ragdoll handoff. Runs every update tick over all live peds.
//
// Death path: combat reduces `stat_health.current` (or sets `isDead`) on a ped → we detect it →
// `killPed` marks the ped dead, hides its instance, writes a `ped_ragdoll` handoff (+ emits an
// event) for the physics/ragdoll subsystem, and schedules the pool slot for recycling.

import { PedArchetype } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import {
  ARRIVE_R,
  CALM_THRESHOLD,
  FLEE_THRESHOLD,
  IDLE_MAX_S,
  IDLE_MIN_S,
  PANIC_THRESHOLD,
  RAGDOLL_LINGER_MS,
} from "./config";

/** Armed peds (and gangsters) FIGHT when threatened; everyone else flees. pedCombat drives them. */
function isFighter(a: PedAgent): boolean {
  return a.weapon !== null || a.archetype === PedArchetype.Gangster;
}
import { randomNeighbor } from "./nav";
import {
  enterCower,
  enterFlee,
  refreshFleeTarget,
  resnapNode,
  setAgentTarget,
  shouldCalm,
} from "./reactions";
import { rand, rangeR } from "./rng";
import { pedThreatBus } from "./perception";
import { hideSlot } from "./render/pedInstances";
import { releasePed } from "./spawn";
import { pedQuery } from "./queries";
import type { PedAgent } from "./types";

const IDLE_ON_ARRIVE_CHANCE = 0.22;

function arrived(e: ClientEntity): boolean {
  const a = e.ped_agent!;
  if (a.target < 0) return true;
  const t = e.transform!;
  const dx = t.position.x - a.destX;
  const dz = t.position.z - a.destZ;
  return dx * dx + dz * dz <= ARRIVE_R * ARRIVE_R;
}

function beginIdle(a: PedAgent): void {
  a.state = "idle";
  a.stateT = rangeR(rand, IDLE_MIN_S, IDLE_MAX_S);
  a.target = -1;
}

function beginWander(e: ClientEntity): void {
  const a = e.ped_agent!;
  const t = e.transform!;
  resnapNode(a, t.position.x, t.position.z);
  const next = randomNeighbor(a.node, rand, -1);
  if (next < 0) {
    beginIdle(a);
    return;
  }
  a.state = "wander";
  setAgentTarget(a, next);
}

function onArriveWander(e: ClientEntity): void {
  const a = e.ped_agent!;
  const from = a.node;
  if (a.target >= 0) a.node = a.target;
  if (rand() < IDLE_ON_ARRIVE_CHANCE) {
    beginIdle(a);
    return;
  }
  const next = randomNeighbor(a.node, rand, from);
  if (next < 0) beginIdle(a);
  else setAgentTarget(a, next);
}

/** Main FSM step. `tickable(e)` gates far-tier peds to their round-robin cadence (LOD). */
export function tickBehavior(dt: number, tickable: (a: PedAgent) => boolean): void {
  const now = performance.now();
  let toRelease: ClientEntity[] | null = null;

  for (const e of pedQuery) {
    const a = e.ped_agent!;

    // ── Death handling ──────────────────────────────────────────────────────────────────
    if (a.state === "dead") {
      if (now - a.deadAt > RAGDOLL_LINGER_MS) (toRelease ??= []).push(e);
      continue;
    }
    const hp = e.stat_health;
    if ((hp && hp.current <= 0) || e.isDead) {
      killPed(e);
      continue;
    }

    if (!tickable(a)) continue;

    // ── Fear-driven transitions ─────────────────────────────────────────────────────────
    if (
      a.fear >= FLEE_THRESHOLD &&
      a.state !== "flee" &&
      a.state !== "panic" &&
      a.state !== "fight"
    ) {
      if (isFighter(a)) {
        // Stand and fight — pedCombat owns the approach + shooting from here.
        a.state = "fight";
        a.stateT = 0;
        a.target = -1;
      } else {
        enterFlee(e);
      }
      continue;
    }

    switch (a.state) {
      case "fight": {
        // pedCombat drives the motion + firing. Only calm down (disengage) once fear fully fades.
        a.stateT += dt;
        if (a.fear < CALM_THRESHOLD) beginWander(e);
        break;
      }
      case "flee":
      case "panic": {
        a.stateT += dt;
        a.state = a.fear >= PANIC_THRESHOLD ? "panic" : "flee";
        if (shouldCalm(a)) {
          beginWander(e);
        } else if (arrived(e)) {
          refreshFleeTarget(e);
        }
        break;
      }
      case "cower": {
        a.stateT += dt;
        if (a.fear >= FLEE_THRESHOLD) enterFlee(e);
        else if (shouldCalm(a)) beginWander(e);
        break;
      }
      case "idle": {
        a.stateT -= dt; // seeded as remaining idle time; counts down to 0
        // Gentle look-around while loitering (pivots in place; feet stay planted). Bounded because
        // it integrates a cosine, and desynced per ped via tickPhase.
        a.heading += Math.cos(a.stateT * 1.3 + a.tickPhase) * dt * 0.2;
        if (a.stateT <= 0) beginWander(e);
        break;
      }
      case "wander":
      case "walk":
      default: {
        a.stateT += dt;
        if (a.target < 0) beginWander(e);
        else if (arrived(e)) onArriveWander(e);
        break;
      }
    }
  }

  if (toRelease) for (const e of toRelease) releasePed(e);
}

// ── Death / ragdoll handoff ─────────────────────────────────────────────────────────────────

export interface KillOptions {
  dirX?: number;
  dirY?: number;
  dirZ?: number;
  impulse?: number;
  bone?: string;
  point?: [number, number, number];
}

/**
 * Kill a ped: mark dead, hide its instance, and hand off to the ragdoll subsystem via the
 * `ped_ragdoll` component (+ `isDead` tag + `pedThreatBus`/window events). The pool slot recycles
 * after RAGDOLL_LINGER_MS. Safe to call from combat or internally. Idempotent.
 */
export function killPed(e: ClientEntity, opts?: KillOptions): void {
  const a = e.ped_agent;
  if (!a || a.state === "dead") return;
  const t = e.transform!;
  a.state = "dead";
  a.deadAt = performance.now();
  a.speed = 0;
  a.vx = 0;
  a.vz = 0;

  // Impulse direction: explicit, else away from the last threat epicentre, else forward.
  let dx = opts?.dirX ?? t.position.x - a.fleeX;
  let dz = opts?.dirZ ?? t.position.z - a.fleeZ;
  let dy = opts?.dirY ?? 0.25;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;

  const px = opts?.point?.[0] ?? t.position.x;
  const py = opts?.point?.[1] ?? t.position.y;
  const pz = opts?.point?.[2] ?? t.position.z;

  if (!e.isDead) world.addComponent(e, "isDead", true);
  world.addComponent(e, "ped_ragdoll", {
    x: px,
    y: py,
    z: pz,
    dirX: dx,
    dirY: dy,
    dirZ: dz,
    impulse: opts?.impulse ?? 6,
    bone: opts?.bone ?? "chest",
    archetype: a.archetype,
    at: a.deadAt,
    handled: false,
  });

  hideSlot(a.archetype, a.slot); // instanced corpse handled by ragdoll subsystem now

  pedThreatBus.emit("death", { netId: e.netId, x: px, y: py, z: pz });
  if (typeof window !== "undefined") {
    const detail = { netId: e.netId, x: px, y: py, z: pz, dir: [dx, dy, dz], archetype: a.archetype };
    window.dispatchEvent(new CustomEvent("sunbreak:ped-ragdoll", { detail }));
    window.dispatchEvent(new CustomEvent("sunbreak:ped-died", { detail }));
  }
}
