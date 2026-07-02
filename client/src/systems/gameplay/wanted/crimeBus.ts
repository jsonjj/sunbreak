// The crime bus — the public seam every crime signal flows through. Any producer publishes a
// crime and `crimeSystem` drains it once per frame (gated by witness/hearing before it raises
// heat). This is where the wanted subsystem CONSUMES the shared `damage`/`death` events:
//
//   - Combat/Vehicles/Player call `reportDamage(...)` / `reportDeath(...)` / `reportCrime(...)`.
//     They can import these from `@/systems/gameplay/wanted`, OR find them on `globalThis`
//     (`WANTED_GLOBAL_KEY`) with no static import, OR dispatch DOM CustomEvents
//     (`sunbreak:damage` / `sunbreak:death` / `sunbreak:crime`). All three routes feed the SAME
//     frame-buffered queue, so however the integrator wires producers, it just works.
//   - Until producers are wired, `crimeSystem` also synthesises crimes from ECS truth
//     (player weapon-fire + nearby `isDead` kills), so heat rises solo today.
//
// WHY LOCAL: the spec puts this at `client/src/bus/crimeBus.ts`; Wave-2 file-ownership keeps it
// here and re-exports it from `index.ts`.
import mitt from "mitt";
import type { Emitter } from "mitt";
import type { CrimeEvent, DamageEvent, DeathEvent, WantedCrimeType } from "./types";

/** Optional pub/sub for external listeners (audio stings, telemetry). Heat uses the queue. */
export const crimeBus: Emitter<{ crime: CrimeEvent }> = mitt<{ crime: CrimeEvent }>();

// Double-buffered queue: zero per-frame allocation after warmup. `reportCrime` pushes to the
// active buffer; `drainCrimes` returns the full buffer and swaps in the (cleared) spare.
const bufA: CrimeEvent[] = [];
const bufB: CrimeEvent[] = [];
let active: CrimeEvent[] = bufA;

/** Publish a crime. Safe to call from any system, any frame, any producer. */
export function reportCrime(e: CrimeEvent): void {
  active.push(e);
  crimeBus.emit("crime", e);
}

/** Drain this frame's crimes. The returned array is reused — consume it before the next drain. */
export function drainCrimes(): CrimeEvent[] {
  const full = active;
  active = active === bufA ? bufB : bufA;
  active.length = 0;
  return full;
}

/** Map a generic damage event (the shared "damage" signal) to a CONTACT crime and publish it.
 *  Only hits on PEOPLE (civilian/police) are `contact` — the only thing that raises wanted (v2). */
export function reportDamage(e: DamageEvent): void {
  const person = e.victimKind === "police" || e.victimKind === "civilian";
  let type: WantedCrimeType;
  if (e.victimKind === "police") type = "officerAttacked";
  else if (e.victimKind === "vehicle" || e.victimKind === "prop") type = "recklessDrive";
  else if (e.melee || !e.weapon) type = "fistfight";
  else type = "gunfire";
  reportCrime({
    type,
    position: e.position,
    actorNetId: e.attackerNetId,
    victimNetId: e.victimNetId,
    victimKind: e.victimKind,
    contact: person,
    lethal: false,
  });
}

/** Map a generic death event (the shared "death" signal) to a CONTACT crime and publish it. */
export function reportDeath(e: DeathEvent): void {
  // The player dying is not a crime the player commits — ignore it here (game-ux owns that).
  if (e.victimKind === "player") return;
  const person = e.victimKind === "police" || e.victimKind === "civilian";
  const type: WantedCrimeType = e.victimKind === "police" ? "officerKilled" : "civilianKilled";
  reportCrime({
    type,
    position: e.position,
    actorNetId: e.killerNetId,
    victimNetId: e.victimNetId,
    victimKind: e.victimKind,
    contact: person,
    lethal: true,
  });
}

// ── Global + DOM bridges so decoupled producers need no static import ─────────────────────────
/** Stable global handle other subsystems can discover without importing this module. */
export const WANTED_GLOBAL_KEY = "__SUNBREAK_WANTED__" as const;

export interface WantedGlobalApi {
  reportCrime: typeof reportCrime;
  reportDamage: typeof reportDamage;
  reportDeath: typeof reportDeath;
}

const globalApi: WantedGlobalApi = { reportCrime, reportDamage, reportDeath };
(globalThis as unknown as Record<string, WantedGlobalApi>)[WANTED_GLOBAL_KEY] = globalApi;

if (typeof window !== "undefined") {
  window.addEventListener("sunbreak:crime", (ev) => {
    const detail = (ev as CustomEvent<CrimeEvent>).detail;
    if (detail) reportCrime(detail);
  });
  window.addEventListener("sunbreak:damage", (ev) => {
    const detail = (ev as CustomEvent<DamageEvent>).detail;
    if (detail) reportDamage(detail);
  });
  window.addEventListener("sunbreak:death", (ev) => {
    const detail = (ev as CustomEvent<DeathEvent>).detail;
    if (detail) reportDeath(detail);
  });
}
