// gameplay/wanted (client) — WANTED LEVEL & POLICE AI.
// Self-registers on import (the Wave-2 auto-registration contract): the systems-loader eagerly
// imports this file, which calls `registerModule` at module top level. The full crime →
// perception → heat → dispatch → pursuit → search → cooldown loop runs from the SystemRegistry;
// the R3F view (<WantedView/>) and HUD widget (<WantedStars/>) are optional and mounted by the
// integrator (see wiring notes at the bottom).
//
// Delivers spec v2: 1–5 star system, witness/LOS/hearing detection, Dispatch Director,
// escalating spawns (cruisers → foot → roadblocks), per-unit pursuit/search/cooldown FSM, HUD
// mirror. Fully client-side, single-player.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

// ECS augmentation (declaration merging of the wanted_* components) — must load for typing.
import "./wanted.components";

import { perceptionSystem } from "./perceptionSystem";
import { crimeSystem } from "./crimeSystem";
import { dispatchSystem } from "./dispatchSystem";
import { searchSystem } from "./searchSystem";
import { pursuitSystem } from "./pursuitSystem";
import { cooldownSystem } from "./cooldownSystem";
import { hudMirrorSystem } from "./hudMirrorSystem";
import { initPool, destroyPool } from "./pool";
import { MAX_HERO_POLICE } from "./tuning";

type W = typeof world;

/** The subsystem module. Systems are ordered within the `update`/`finish` phases. */
export const wanted: SubsystemModule<W> = {
  id: "gameplay/wanted",
  systems: [
    perceptionSystem, // update 10 — staggered witness/officer sight + hearing
    crimeSystem, // update 20 — consume damage/death/crime signals → heat
    dispatchSystem, // update 30 — tier → budget spawns/despawns
    searchSystem, // update 38 — LKP probability-sweep point assignment
    pursuitSystem, // update 40 — per-unit FSM + kinematic driving
    cooldownSystem, // update 50 — uncontested star decay + searching flag
    hudMirrorSystem, // finish 20 — mirror stars to shared HUD store + player entity
  ],
  init() {
    // Pre-allocate the max hero cap once; dispatch only DEPLOYS up to the per-quality cap.
    initPool(MAX_HERO_POLICE.high);
    return () => destroyPool();
  },
};

registerModule(wanted); // required self-registration side effect

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — for the integrator and crime producers (combat / vehicles / player)
// ─────────────────────────────────────────────────────────────────────────────

/** Crime seam: publish crimes / the shared damage+death signals from any producer. */
export {
  reportCrime,
  reportDamage,
  reportDeath,
  drainCrimes,
  crimeBus,
  WANTED_GLOBAL_KEY,
} from "./crimeBus";
export type { WantedGlobalApi } from "./crimeBus";

/** Wanted state + read helpers (HUD, Missions pursuit-pressure, etc.). */
export { useWantedStore, getWantedLevel, isWanted } from "./store";

/** Toggle the built-in ECS/input crime synthesis once real producers are wired. */
export { setCrimeSynthesis, isCrimeSynthesis } from "./crimeSystem";

/** Optional views the integrator mounts (see wiring notes). */
export { WantedView } from "./view/WantedView";
export { WantedStars } from "./view/WantedStars";

/** Pool introspection + tuning tables (debug / balance). */
export { activeCount, pooledSize } from "./pool";
export { CRIME_HEAT, TIER_BUDGETS, COOLDOWN_S, MAX_HERO_POLICE, MAX_STARS } from "./tuning";

/** All public types (CrimeEvent, DamageEvent, DeathEvent, roles, archetypes, …). */
export type * from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATOR WIRING NOTES
// ─────────────────────────────────────────────────────────────────────────────
// 1. Police visuals + occlusion LOS: mount <WantedView/> ONCE inside the R3F <Physics> tree
//    (e.g. in game/Scene.tsx alongside <Environment/>). It renders deployed police via the
//    ECS↔R3F bridge and injects the Rapier context for line-of-sight raycasts. If omitted, the
//    star system + HUD still work; only police meshes and static-occlusion LOS are absent
//    (perception falls back to FOV + distance).
// 2. HUD stars: the current level is already mirrored into the shared central HUD store
//    (`useHudStore().heat`, 0–5) and onto the player entity (`wanted_stars`). The ui/menu-hud
//    subsystem should read `heat` from that store. For a drop-in widget, mount <WantedStars/>
//    as a sibling of <Canvas> (a DOM overlay).
// 3. Crime producers: Combat/Vehicles/Player raise heat by calling reportDamage / reportDeath /
//    reportCrime (import from "@/systems/gameplay/wanted", or use globalThis[WANTED_GLOBAL_KEY],
//    or dispatch DOM CustomEvents "sunbreak:damage" / "sunbreak:death" / "sunbreak:crime").
//    Until then, the subsystem synthesises gunfire from player fire-input and murders from
//    nearby kills; call setCrimeSynthesis(false) to disable that once real producers emit.
