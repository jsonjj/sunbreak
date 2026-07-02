// The crime → heat gate (v2: CONTACT-DRIVEN).
//
// Wanted rises ONLY when the player makes actual CONTACT with a person (hits or kills them) — never
// from merely firing a gun or driving. Each frame it drains the crime bus (fed by combat's shared
// damage/death events) and, for every player-attributed CONTACT crime, applies heat with:
//   • a per-victim debounce (a re-hit on the SAME person within CONTACT_DEBOUNCE_S doesn't re-count),
//   • scaling by the number of DISTINCT victims this spree (more people → higher wanted),
//   • kills weighing more than hits, and
//   • cops weighing more than civilians.
// The distinct-victim set + per-victim timers reset once wanted fully clears (stars → 0).

import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { playerQuery } from "./queries";
import { drainCrimes } from "./crimeBus";
import { CONTACT_DEBOUNCE_S, CONTACT_HEAT, minStarsForDistinct } from "./tuning";
import { useWantedStore } from "./store";
import { now } from "./clock";
import type { CrimeEvent } from "./types";

type W = typeof World;

// Retained across the wave, exported for API compatibility. Synthesis (firing/driving → wanted) is
// intentionally disabled in v2 — wanted is contact-driven only.
let synthesize = false;
export function setCrimeSynthesis(enabled: boolean): void {
  synthesize = enabled;
}
export const isCrimeSynthesis = (): boolean => synthesize;

// ── Spree state (reset when wanted clears) ────────────────────────────────────
/** victim netId → sim-seconds of the last COUNTED contact (debounce). */
const lastHitAt = new Map<number, number>();
/** Distinct people hit this spree (drives the star floor). */
const distinctVictims = new Set<number>();
let prevStars = 0;

function resetSpree(): void {
  lastHitAt.clear();
  distinctVictims.clear();
}

function seedSuspectIfNeeded(): void {
  const st = useWantedStore.getState();
  if (!st.suspectProfile) {
    st.setSuspectProfile({ faceConfidence: 0.9, outfitId: "player", vehicleDescriptor: null });
  }
}

export const crimeSystem: System<W> = {
  name: "wanted/crime",
  phase: "update",
  order: 20,
  fn: () => {
    const player = playerQuery.entities[0];
    if (!player || !player.transform) return;
    const playerNetId = player.netId ?? 1;
    const t = now();

    // Reset the spree whenever the player fully cools off (stars back to 0).
    const stars = useWantedStore.getState().stars;
    if (stars === 0 && prevStars > 0) resetSpree();
    prevStars = stars;

    const crimes: CrimeEvent[] = drainCrimes();
    if (crimes.length === 0) return;

    const st = useWantedStore.getState();
    for (const c of crimes) {
      // v2: ONLY direct contact crimes raise wanted, and only when the PLAYER is the actor.
      if (!c.contact) continue;
      if (c.actorNetId !== undefined && c.actorNetId !== playerNetId) continue;
      const vid = c.victimNetId;
      if (vid === undefined) continue;
      const cop = c.victimKind === "police";
      if (!cop && c.victimKind !== "civilian") continue; // people only

      // Per-victim debounce (a kill always counts, even inside the window).
      if (!c.lethal && t - (lastHitAt.get(vid) ?? -Infinity) < CONTACT_DEBOUNCE_S) continue;
      lastHitAt.set(vid, t);

      const isNew = !distinctVictims.has(vid);
      distinctVictims.add(vid);

      let heat = c.lethal
        ? cop
          ? CONTACT_HEAT.killPolice
          : CONTACT_HEAT.killCivilian
        : cop
          ? CONTACT_HEAT.hitPolice
          : CONTACT_HEAT.hitCivilian;
      if (isNew) heat += CONTACT_HEAT.newVictimBonus;

      // Star floor: the higher of (distinct-victim count) and (this crime's own severity floor).
      const severityFloor = cop ? (c.lethal ? 4 : 3) : c.lethal ? 2 : 1;
      const floor = Math.max(minStarsForDistinct(distinctVictims.size), severityFloor);

      st.addHeat(heat, floor);
      st.setLkp({ x: c.position.x, z: c.position.z });
      seedSuspectIfNeeded();
    }
  },
};
