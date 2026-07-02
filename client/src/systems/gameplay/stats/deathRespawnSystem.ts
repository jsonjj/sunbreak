// Death → respawn (+ busted) state machine, plus non-player death tagging.
//
// Frame-driven (no async): alive → dying (fade to black) → [charge fee + teleport + reset while
// black] → reviving (fade back in) → alive. Player death is detected from `stat_health<=0`;
// busted is requested by the police/wanted subsystem via `requestRespawn("busted")`. A brief
// post-respawn invulnerability window blocks respawn loops. Non-player entities (peds) that hit
// 0 health are simply tagged `stat_dead` + `isDead` for the peds subsystem to react to.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import {
  BUST_FEE,
  FADE_HOLD_S,
  FADE_IN_S,
  FADE_OUT_S,
  HOSPITAL_FEE,
  INVULN_MS,
  staminaMaxForSkill,
} from "./constants";
import { clamp } from "./vitals";
import {
  clearDead,
  ensurePlayerVitals,
  getPlayer,
  getPlayerPosition,
  markBusted,
  markDead,
  readVitals,
  teleportPlayer,
  writeVitals,
} from "./entityVitals";
import { getEconomy, getPolice } from "./interfaces";
import { nearest } from "./respawnPoints";
import { useStatStore } from "./store";
import type { RespawnPhase, RespawnReason, Vitals } from "./types";

type W = typeof world;

/** Non-player mortals to scan for death. Reused (create once, iterate every frame). */
const mortals = world.with("stat_health").without("stat_dead");

const rs = {
  phase: "alive" as RespawnPhase,
  reason: null as RespawnReason | null,
  fade: 0,
  timer: 0,
  teleported: false,
  invulnUntil: 0,
  pending: null as RespawnReason | null,
};

/** Request a respawn (police → "busted", debug/other → "dead"). Debounced while non-alive. */
export function requestRespawn(reason: RespawnReason): void {
  if (rs.phase !== "alive") return;
  rs.pending = reason;
}

export function getRespawnPhase(): RespawnPhase {
  return rs.phase;
}

export function isInvulnerable(now: number = performance.now()): boolean {
  return now < rs.invulnUntil;
}

// Store mirror (only push on meaningful change so overlays don't churn).
let lastPhase: RespawnPhase | null = null;
let lastReason: RespawnReason | null = null;
let lastFade = -1;
function syncStore(): void {
  if (
    rs.phase !== lastPhase ||
    rs.reason !== lastReason ||
    Math.abs(rs.fade - lastFade) > 0.001
  ) {
    lastPhase = rs.phase;
    lastReason = rs.reason;
    lastFade = rs.fade;
    useStatStore.getState().patch({
      respawnPhase: rs.phase,
      respawnReason: rs.reason,
      fade: rs.fade,
    });
  }
}

function beginDying(player: ClientEntity): void {
  rs.phase = "dying";
  rs.reason = rs.pending ?? "dead";
  rs.pending = null;
  rs.timer = 0;
  rs.teleported = false;
  if (rs.reason === "busted") markBusted(player);
  else markDead(player);
}

function performRespawn(player: ClientEntity, now: number): void {
  const reason = rs.reason ?? "dead";
  const busted = reason === "busted";

  getEconomy().charge(busted ? BUST_FEE : HOSPITAL_FEE, reason);

  const dest = nearest(getPlayerPosition(player), busted ? "policeStation" : "hospital");
  teleportPlayer(player, dest);

  const cur = readVitals(player);
  const reset: Vitals = {
    ...cur,
    health: cur.healthMax,
    armor: 0,
    stamina: staminaMaxForSkill(cur.staminaSkill),
    alive: true,
    lastDamageAt: now,
  };
  writeVitals(player, reset);
  clearDead(player);

  getPolice().clearWanted();
  rs.invulnUntil = now + INVULN_MS;
}

export const deathRespawnSystem: System<W> = {
  name: "stats:deathRespawn",
  phase: "update",
  order: 20, // after vitalsSystem (order 10)
  fn: (_world, dt) => {
    const now = performance.now();

    // 1) Non-player death tagging (peds/combat drove stat_health to 0). Copy the array because
    //    markDead reindexes the query mid-iteration.
    for (const e of [...mortals.entities]) {
      if (e.isPlayer) continue;
      if ((e.stat_health?.current ?? 1) <= 0) markDead(e);
    }

    // 2) Player death/respawn machine.
    const player = getPlayer();
    if (player) {
      ensurePlayerVitals(player);

      if (rs.phase === "alive") {
        const v = readVitals(player);
        if (!v.alive || v.health <= 0) rs.pending = "dead";
        if (rs.pending) beginDying(player);
      }

      if (rs.phase === "dying") {
        rs.timer += dt;
        rs.fade = clamp(rs.timer / FADE_OUT_S, 0, 1);
        if (rs.timer >= FADE_OUT_S && !rs.teleported) {
          performRespawn(player, now);
          rs.teleported = true;
        }
        if (rs.timer >= FADE_OUT_S + FADE_HOLD_S) {
          rs.phase = "reviving";
          rs.timer = 0;
        }
      } else if (rs.phase === "reviving") {
        rs.timer += dt;
        rs.fade = 1 - clamp(rs.timer / FADE_IN_S, 0, 1);
        if (rs.timer >= FADE_IN_S) {
          rs.phase = "alive";
          rs.reason = null;
          rs.fade = 0;
        }
      }
    }

    syncStore();
  },
};
