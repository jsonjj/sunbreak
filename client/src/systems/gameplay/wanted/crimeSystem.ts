// The crime → heat gate. Each frame it:
//   1. Synthesises crimes from ECS/input truth (player weapon-fire + nearby kills) so heat
//      rises with zero external wiring — the working default. Toggle off with
//      `setCrimeSynthesis(false)` once real producers publish through the bus.
//   2. Drains the crime bus (the shared damage/death + explicit crime signals).
//   3. For every crime the PLAYER committed, checks a witness saw it (or it was loud enough to
//      be heard) before applying `CRIME_HEAT` — raising heat, seeding the last-known-position
//      and the suspect profile.
import { InputAction } from "@sunbreak/shared";
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { input } from "@/input/InputManager";
import { activePoliceQuery, deadQuery, playerQuery, witnessQuery } from "./queries";
import { drainCrimes, reportCrime, reportDeath } from "./crimeBus";
import { hasLineOfSight, planarDist2 } from "./los";
import { CRIME_HEAT } from "./tuning";
import { useWantedStore } from "./store";
import { now } from "./clock";
import type { CrimeEvent, VictimKind } from "./types";

type W = typeof World;

const GUN_REPEAT_S = 0.4; // held-fire re-reports gunfire at this cadence
const KILL_ATTRIB_R = 22; // metres: a nearby fresh corpse is pinned on the player…
const KILL_ATTRIB_WINDOW = 5; // …if they fired within this many seconds
const WITNESS_R = 25; // ambient-ped witness sight range

let synthesize = true;
let prevFire = false;
let lastGunAt = -Infinity;
const countedDeaths = new Set<number>();

/** Integrator hook: disable ECS/input crime synthesis once Combat/Vehicles publish real crimes. */
export function setCrimeSynthesis(enabled: boolean): void {
  synthesize = enabled;
}
export const isCrimeSynthesis = (): boolean => synthesize;

function seedSuspectIfNeeded(): void {
  const st = useWantedStore.getState();
  if (!st.suspectProfile) {
    st.setSuspectProfile({ faceConfidence: 0.9, outfitId: "player", vehicleDescriptor: null });
  }
}

function crimeWitnessed(pos: { x: number; y: number; z: number }, loud: boolean): boolean {
  if (loud) return true; // ambient city witnesses always report gunfire / booms / kills
  for (const u of activePoliceQuery.entities) {
    if (!u.transform || !u.wanted_perception) continue;
    const up = u.transform.position;
    if (
      planarDist2(up.x, up.z, pos.x, pos.z) <= u.wanted_perception.range * u.wanted_perception.range &&
      hasLineOfSight(up.x, up.y + 1.2, up.z, pos.x, pos.y + 0.4, pos.z)
    ) {
      return true;
    }
  }
  for (const w of witnessQuery.entities) {
    if (!w.transform) continue;
    const wp = w.transform.position;
    if (
      planarDist2(wp.x, wp.z, pos.x, pos.z) <= WITNESS_R * WITNESS_R &&
      hasLineOfSight(wp.x, wp.y + 1.6, wp.z, pos.x, pos.y + 0.4, pos.z)
    ) {
      return true;
    }
  }
  return false;
}

export const crimeSystem: System<W> = {
  name: "wanted/crime",
  phase: "update",
  order: 20,
  fn: () => {
    const player = playerQuery.entities[0];
    if (!player || !player.transform) return;
    const pp = player.transform.position;
    const playerNetId = player.netId ?? 1;
    const t = now();

    // 1. Synthesised producers (default until real Combat/Vehicles wiring exists).
    if (synthesize) {
      const firing = input.locked && input.isActionDown(InputAction.Fire);
      if (firing && (!prevFire || t - lastGunAt >= GUN_REPEAT_S)) {
        reportCrime({
          type: "gunfire",
          position: { x: pp.x, y: pp.y, z: pp.z },
          actorNetId: playerNetId,
        });
        lastGunAt = t;
      }
      prevFire = firing;

      const firedRecently = t - lastGunAt < KILL_ATTRIB_WINDOW;
      for (const d of deadQuery.entities) {
        const id = d.netId;
        // Skip the player's own death and other police (not player-committed civilian crimes).
        if (d.isPlayer !== undefined || d.wanted_police !== undefined) continue;
        if (id === undefined || countedDeaths.has(id)) continue;
        const dp = d.transform?.position;
        if (!dp) continue;
        const near = planarDist2(dp.x, dp.z, pp.x, pp.z) <= KILL_ATTRIB_R * KILL_ATTRIB_R;
        if (near && firedRecently) {
          countedDeaths.add(id);
          const kind: VictimKind = "civilian";
          reportDeath({ victimKind: kind, position: { x: dp.x, y: dp.y, z: dp.z }, killerNetId: playerNetId });
        }
      }
    }

    // 2 + 3. Drain the bus and apply heat to witnessed player crimes.
    const crimes: CrimeEvent[] = drainCrimes();
    if (crimes.length === 0) return;

    const st = useWantedStore.getState();
    for (const c of crimes) {
      if (c.actorNetId !== undefined && c.actorNetId !== playerNetId) continue; // not the player
      const cfg = CRIME_HEAT[c.type];
      if (!cfg) continue;
      if (!crimeWitnessed(c.position, cfg.loud)) continue;

      st.addHeat(cfg.delta, cfg.minStars);
      st.setLkp({ x: c.position.x, z: c.position.z });
      seedSuspectIfNeeded();
    }
  },
};
