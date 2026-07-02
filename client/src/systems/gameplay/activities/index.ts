// Subsystem: gameplay/activities (client) — data-driven activities & minigames framework.
//
// Self-registers a module whose `update` system drives the ActivityManager each frame (content
// loading, world markers/blips, the local interaction fallback, and the run FSM). Everything it
// touches in sibling subsystems flows through injectable ports (see ./ports):
//   • Interaction — activity givers register as interactables; local proximity+prompt fallback.
//   • Economy     — completions grant rewards via the econ port (HUD cash + toast fallback).
//   • Map         — giver markers + objective waypoints are published as blips (HUD blip fallback).
//
// Integration: call configureActivityPorts({...}) once to inject the real sibling APIs.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
// Side-effect import: applies the `act_*` SimComponents augmentation to the whole program.
import "./activities.components";
import { activityManager } from "./manager";

type W = typeof world;

export const activities: SubsystemModule<W> = {
  id: "gameplay/activities",
  systems: [
    {
      name: "activities/tick",
      phase: "update",
      order: 50,
      fn: (_w, dt) => activityManager.tick(dt),
    },
  ],
  init() {
    return activityManager.init();
  },
};

registerModule(activities);

// ── Public API (for the HUD/UI subsystem and the integrator) ──────────────────
export { configureActivityPorts, getPorts } from "./ports";
export type {
  ActivityPorts,
  EconPort,
  BlipsPort,
  InteractionPort,
  InteractionEntry,
  ActivityBlip,
  RewardMeta,
} from "./ports";
export { useActivityStore } from "./runtime/store";
export type { ActivityRunView, OfferView, ActivityBanner } from "./runtime/store";
export { activityManager } from "./manager";
export { parseActivityDef, parseActivityDefs } from "./schema";
export type {
  ActivityDef,
  ActivityKind,
  RewardSpec,
  RewardTier,
  RunResult,
  RunState,
} from "./types";

/** Small curated surface for debug consoles + external triggers. */
export const activitiesApi = {
  list: () => activityManager.list(),
  start: (id: string) => activityManager.start(id),
  cancel: () => activityManager.cancel(),
  setEnabled: (on: boolean) => activityManager.setEnabled(on),
  /** Re-publish markers/blips onto the current ports (call after configureActivityPorts). */
  reload: () => activityManager.reload(),
  /** Combat seam: credit any rampage target at a world position. */
  notifyHitAt: activityManager.notifyHitAt.bind(activityManager),
};

// Expose a dev handle so activities can be triggered from the console during the wave.
{
  const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  if (dev && typeof window !== "undefined") {
    (window as unknown as { __sunbreakActivities?: typeof activitiesApi }).__sunbreakActivities =
      activitiesApi;
  }
}
