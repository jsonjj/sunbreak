// Dispatch Director: maps the current star tier to a unit budget (capped per quality tier),
// then acquires reinforcements from the pool at off-screen ring positions after the district
// response time — trickled in one at a time — and releases surplus when heat drops. Cop cars
// are kinematic in v2 (no road graph yet); roadblocks are parked cruisers ahead of the suspect.
import type { System } from "@sunbreak/shared";
import type { world as World } from "@/ecs/world";
import { useQuality } from "@/render/quality/useQuality";
import { playerQuery, activePoliceQuery } from "./queries";
import { acquire, acquireRoadblock, release, releaseAll } from "./pool";
import {
  MAX_HERO_POLICE,
  REINFORCE_STAGGER_S,
  RESPONSE_TIME_S,
  SPAWN_RING_M,
  TIER_BUDGETS,
} from "./tuning";
import { useWantedStore } from "./store";
import { now } from "./clock";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { UnitArchetype } from "./types";

type W = typeof World;

const RATE = 1 / 3; // dispatch decisions ~3 Hz
let acc = 0;
let prevStars = 0;
let wantedSince = 0;
let lastSpawnAt = 0;

const isMobile = (e: ClientEntity): boolean =>
  e.wanted_police !== undefined && e.wanted_roadblock === undefined;
const isFoot = (e: ClientEntity): boolean => e.wanted_police?.archetype === "foot";

/** Pick a car archetype, mixing in unmarked/SRT variety unlocked at higher tiers. */
function pickCarArchetype(extras: UnitArchetype[]): UnitArchetype {
  const r = Math.random();
  if (extras.includes("srtVan") && r < 0.18) return "srtVan";
  if (extras.includes("unmarked") && r < 0.42) return "unmarked";
  return "cruiser";
}

function ringPos(px: number, pz: number): { x: number; z: number } {
  const ang = Math.random() * Math.PI * 2;
  return { x: px + Math.cos(ang) * SPAWN_RING_M, z: pz + Math.sin(ang) * SPAWN_RING_M };
}

export const dispatchSystem: System<W> = {
  name: "wanted/dispatch",
  phase: "update",
  order: 30,
  fn: (_w, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;

    const store = useWantedStore.getState();
    const stars = store.stars;
    const t = now();

    if (stars > 0 && prevStars === 0) {
      wantedSince = t;
      lastSpawnAt = 0;
    }
    prevStars = stars;

    if (stars === 0) {
      if (activePoliceQuery.entities.length > 0) releaseAll();
      return;
    }

    const player = playerQuery.entities[0];
    if (!player || !player.transform) return;
    const pp = player.transform.position;
    const playerNetId = player.netId ?? 1;

    const budget = TIER_BUDGETS[stars] ?? TIER_BUDGETS[0]!;
    const cap = MAX_HERO_POLICE[useQuality.getState().tier];

    // Clamp the tier budget to the hard hero cap (trim roadblocks → foot → cruisers).
    let remaining = cap;
    const wantCruisers = Math.min(budget.cruisers, remaining);
    remaining -= wantCruisers;
    const wantFoot = Math.min(budget.foot, remaining);
    remaining -= wantFoot;
    const wantRoadblocks = Math.min(budget.roadblocks, remaining);

    // Tally what's already deployed.
    let curCars = 0;
    let curFoot = 0;
    let curBlocks = 0;
    for (const e of activePoliceQuery.entities) {
      if (e.wanted_roadblock !== undefined) curBlocks++;
      else if (isFoot(e)) curFoot++;
      else if (isMobile(e)) curCars++;
    }

    // First responders only after the district response time; then trickle reinforcements.
    const responded = t - wantedSince >= RESPONSE_TIME_S.urban;
    const canSpawn = responded && t - lastSpawnAt >= REINFORCE_STAGGER_S;

    if (canSpawn) {
      if (curCars < wantCruisers) {
        if (acquire(pickCarArchetype(budget.extras), "pursuer", ringPos(pp.x, pp.z), playerNetId))
          lastSpawnAt = t;
      } else if (curFoot < wantFoot) {
        if (acquire("foot", "pursuer", ringPos(pp.x, pp.z), playerNetId)) lastSpawnAt = t;
      } else if (curBlocks < wantRoadblocks) {
        const facing = player.movement?.facing ?? 0;
        const ahead = { x: pp.x - Math.sin(facing) * 42, z: pp.z - Math.cos(facing) * 42 };
        if (acquireRoadblock(ahead, facing + Math.PI / 2)) lastSpawnAt = t;
      }
    }

    // Release surplus one unit per tick (heat dropped) — prefer roadblocks, then foot, then cars.
    if (curBlocks > wantRoadblocks) {
      const victim = activePoliceQuery.entities.find((e) => e.wanted_roadblock !== undefined);
      if (victim) release(victim);
    } else if (curFoot > wantFoot) {
      const victim = activePoliceQuery.entities.find((e) => isFoot(e));
      if (victim) release(victim);
    } else if (curCars > wantCruisers) {
      const victim = activePoliceQuery.entities.find((e) => isMobile(e) && !isFoot(e));
      if (victim) release(victim);
    }

    store.setActiveUnits(activePoliceQuery.entities.length);
  },
};
