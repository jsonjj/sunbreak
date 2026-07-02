// ─────────────────────────────────────────────────────────────────────────────
// Bark director — the only "runtime-hot" content path, and it never blocks
// ─────────────────────────────────────────────────────────────────────────────
// Each tick it (a) expires finished barks and (b) assigns fresh ones to a bounded
// number of peds by pulling INSTANTLY from the pre-warmed pool (getBark). It never
// calls the network on the hot path; the optional background refill is fire-and-
// forget and self-guards when runtime generation is off. Ped/dialogue-ui
// subsystems render the bubble by watching `world.with("dyn_barkText")`.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { Speaker } from "./canon";
import { useContentStore, type BarkContext } from "./contentStore";
import { maybeRefillBarks } from "./content-client";

type W = typeof world;

// Tuning.
const EVAL_INTERVAL_S = 0.5; // how often the director re-evaluates
const MAX_ACTIVE_BARKS = 8; // simultaneous on-screen bubbles cap
const ASSIGN_PER_EVAL = 3; // new barks assigned per evaluation
const BARK_CHANCE = 0.2; // per eligible ped, per evaluation
const BARK_MS_MIN = 2500;
const BARK_MS_MAX = 4500;
const COOLDOWN_MS_MIN = 9000;
const COOLDOWN_MS_MAX = 15000;
const REFILL_INTERVAL_S = 5; // background pool top-up cadence (opt-in)
const MIRROR_INTERVAL_S = 0.25; // HUD/debug mirror cadence

// Persistent queries (auto-maintained by miniplex).
const pedsNeedingBark = world.with("isPed").without("dyn_barkText");
const activeBarks = world.with("dyn_barkText", "dyn_barkUntil");

function speakerForArchetype(archetype: string | undefined): Speaker {
  switch (archetype) {
    case "gangster":
      return "gangster";
    case "police":
      return "cop";
    case "tourist":
      return "tourist";
    case "business":
      return "vendor";
    default:
      return "civilian";
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

let evalAcc = 0;
let refillAcc = 0;

const dynBarkDirectorSystem: System<W> = {
  name: "dyn_barkDirector",
  phase: "update",
  order: 20,
  fn: (_w, dt) => {
    evalAcc += dt;
    refillAcc += dt;
    if (evalAcc < EVAL_INTERVAL_S) return;
    evalAcc = 0;

    const store = useContentStore.getState();
    const now = Date.now();

    // (a) Expire finished barks (snapshot: we mutate the query as we go).
    for (const e of Array.from(activeBarks)) {
      if ((e.dyn_barkUntil ?? 0) <= now) {
        world.removeComponent(e, "dyn_barkText");
        world.removeComponent(e, "dyn_barkUntil");
        e.dyn_barkCooldownUntil = now + rand(COOLDOWN_MS_MIN, COOLDOWN_MS_MAX);
      }
    }

    if (!store.ready) return;

    // (b) Assign new barks up to the caps.
    let active = activeBarks.entities.length;
    let assigned = 0;
    const baseCtx = store.barkContext;

    for (const ped of Array.from(pedsNeedingBark)) {
      if (assigned >= ASSIGN_PER_EVAL || active >= MAX_ACTIVE_BARKS) break;
      if ((ped.dyn_barkCooldownUntil ?? 0) > now) continue;
      if (Math.random() > BARK_CHANCE) continue;

      const speaker = speakerForArchetype(ped.ped?.archetype);
      const bark = store.getBark({ ...baseCtx, speaker } as Partial<BarkContext>);
      if (!bark) continue;

      world.addComponent(ped, "dyn_barkText", bark.text);
      world.addComponent(ped, "dyn_barkUntil", now + rand(BARK_MS_MIN, BARK_MS_MAX));
      ped.dyn_barkSpeaker = bark.speaker;
      ped.dyn_barkCooldownUntil = now + rand(COOLDOWN_MS_MIN, COOLDOWN_MS_MAX);
      active++;
      assigned++;
    }

    // Optional, non-blocking pool top-up (no-ops unless runtime is enabled).
    if (refillAcc >= REFILL_INTERVAL_S) {
      refillAcc = 0;
      void maybeRefillBarks(store.barkContext);
    }
  },
};

let mirrorAcc = 0;
let lastActive = -1;

const dynContentMirrorSystem: System<W> = {
  name: "dyn_contentMirror",
  phase: "finish",
  order: 50,
  fn: (_w, dt) => {
    mirrorAcc += dt;
    if (mirrorAcc < MIRROR_INTERVAL_S) return;
    mirrorAcc = 0;
    const n = activeBarks.entities.length;
    if (n === lastActive) return;
    lastActive = n;
    useContentStore.getState().setActiveBarks(n);
  },
};

export const dynSystems: ReadonlyArray<System<W>> = [
  dynBarkDirectorSystem,
  dynContentMirrorSystem,
];
