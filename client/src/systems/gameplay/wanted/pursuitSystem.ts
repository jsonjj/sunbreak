// Per-unit pursuit FSM (PATROL → PURSUE → SEARCH → RETURN). State TRANSITIONS run at FSM_HZ
// (accumulator, not every frame — the spec's 10 Hz rule); MOVEMENT integrates every frame for
// smooth kinematic driving. PURSUE uses a simple utility: close the gap to the stand-off
// distance, then hold — with a min forward push at higher aggression (ram/PIT feel). Cars are
// kinematic here (no road graph in v2); foot units use the same steering at walking speed.
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { activePoliceQuery, playerQuery } from "./queries";
import { FSM_HZ, LOS_LOST_GRACE, RECYCLE_DIST_M, TIER_BUDGETS } from "./tuning";
import { useWantedStore } from "./store";
import { release } from "./pool";
import { now } from "./clock";

type W = typeof World;

const STEP = 1 / FSM_HZ;
const SEPARATION_R = 4.2;
const SEPARATION_PUSH = 6;
let fsmAcc = 0;

function faceYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

function setFacing(e: ClientEntity, yaw: number): void {
  if (e.movement) e.movement.facing = yaw;
  if (e.transform) {
    e.transform.rotation.x = 0;
    e.transform.rotation.y = Math.sin(yaw / 2);
    e.transform.rotation.z = 0;
    e.transform.rotation.w = Math.cos(yaw / 2);
  }
}

/** Sum a light separation offset so units don't stack on the same point. */
function separation(e: ClientEntity, ux: number, uz: number, out: { x: number; z: number }): void {
  out.x = 0;
  out.z = 0;
  for (const o of activePoliceQuery.entities) {
    if (o === e || !o.transform) continue;
    const dx = ux - o.transform.position.x;
    const dz = uz - o.transform.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1e-4 && d2 < SEPARATION_R * SEPARATION_R) {
      const inv = 1 / Math.sqrt(d2);
      const w = (SEPARATION_R - Math.sqrt(d2)) * inv;
      out.x += dx * w;
      out.z += dz * w;
    }
  }
}

const sep = { x: 0, z: 0 };

export const pursuitSystem: System<W> = {
  name: "wanted/pursuit",
  phase: "update",
  order: 40,
  fn: (_w, dt) => {
    const units = activePoliceQuery.entities;
    if (units.length === 0) return;

    const player = playerQuery.entities[0];
    const stars = useWantedStore.getState().stars;
    const aggression = (TIER_BUDGETS[stars] ?? TIER_BUDGETS[0]!).aggression;
    const t = now();

    fsmAcc += dt;
    let doFsm = false;
    if (fsmAcc >= STEP) {
      fsmAcc -= STEP;
      doFsm = true;
    }

    const pp = player?.transform?.position;

    for (const e of units) {
      if (!e.transform || !e.wanted_police) continue;
      if (e.wanted_roadblock !== undefined) continue; // parked; stays put but still perceives

      const police = e.wanted_police;
      const up = e.transform.position;
      const perc = e.wanted_perception;
      const seen = perc ? t - perc.lastSeenAt < LOS_LOST_GRACE : false;

      // ── State transitions (gated at FSM_HZ) ────────────────────────────────
      if (doFsm) {
        if (stars === 0) {
          police.fsm = "RETURN";
        } else {
          switch (police.fsm) {
            case "PURSUE":
              if (!seen) police.fsm = "SEARCH";
              break;
            case "SEARCH":
              if (seen) {
                police.fsm = "PURSUE";
                if (e.wanted_search) world.removeComponent(e, "wanted_search");
              }
              break;
            case "PATROL":
              police.fsm = "PURSUE";
              break;
            case "RETURN":
              police.fsm = "PURSUE";
              break;
          }
        }
      }

      // ── Movement (every frame) ─────────────────────────────────────────────
      const speed = e.wanted_pursuit?.speed ?? (police.archetype === "foot" ? 6 : 16);
      const standoff = e.wanted_pursuit?.desiredDist ?? 6;

      let gx = up.x;
      let gz = up.z;
      let moveScale = 0;
      let faceTargetX = up.x;
      let faceTargetZ = up.z - 1;

      if (police.fsm === "PURSUE" && pp) {
        const dx = pp.x - up.x;
        const dz = pp.z - up.z;
        const dist = Math.hypot(dx, dz) || 1e-6;
        const gap = dist - standoff;
        moveScale = Math.max(Math.min(gap / 3, 1), aggression * 0.5); // ease in; min ram push
        gx = pp.x;
        gz = pp.z;
        faceTargetX = pp.x;
        faceTargetZ = pp.z;
      } else if (police.fsm === "SEARCH") {
        const s = e.wanted_search;
        const store = useWantedStore.getState();
        const tx = s?.pointX ?? store.lkp?.x ?? up.x;
        const tz = s?.pointZ ?? store.lkp?.z ?? up.z;
        gx = tx;
        gz = tz;
        moveScale = 0.7;
        faceTargetX = tx;
        faceTargetZ = tz;
      } else if (police.fsm === "RETURN") {
        // Head away from the suspect until far enough, then recycle to the pool.
        if (pp) {
          const dx = up.x - pp.x;
          const dz = up.z - pp.z;
          const dist = Math.hypot(dx, dz) || 1e-6;
          if (dist >= RECYCLE_DIST_M) {
            release(e);
            continue;
          }
          gx = up.x + dx;
          gz = up.z + dz;
          moveScale = 1;
          faceTargetX = gx;
          faceTargetZ = gz;
        }
      }

      if (moveScale > 0.001) {
        const dx = gx - up.x;
        const dz = gz - up.z;
        const d = Math.hypot(dx, dz) || 1e-6;
        separation(e, up.x, up.z, sep);
        const vx = (dx / d) * speed * moveScale + sep.x * SEPARATION_PUSH * 0.15;
        const vz = (dz / d) * speed * moveScale + sep.z * SEPARATION_PUSH * 0.15;
        up.x += vx * dt;
        up.z += vz * dt;
        if (e.movement) e.movement.speed = Math.hypot(vx, vz);
      } else if (e.movement) {
        e.movement.speed = 0;
      }

      setFacing(e, faceYaw(faceTargetX - up.x, faceTargetZ - up.z));
    }
  },
};
