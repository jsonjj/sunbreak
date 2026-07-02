// The registered phase systems. `mission_update` runs the FSM in the update phase; `mission_hud`
// mirrors HUD/minimap state (objectives, markers, blips) in the finish phase, throttled to ~10 Hz.

import type { System } from "@sunbreak/shared";
import type { world } from "@/ecs/world";
import { missionManager } from "./manager";
import { syncBlips } from "./bridges/blips";

type W = typeof world;

export const missionUpdateSystem: System<W> = {
  name: "mission_update",
  phase: "update",
  order: 50,
  fn: (_world, dt) => {
    missionManager.update(dt);
  },
};

const HUD_RATE = 1 / 10;
let hudAcc = 0;

export const missionHudSystem: System<W> = {
  name: "mission_hud",
  phase: "finish",
  order: 50,
  fn: (_world, dt) => {
    hudAcc += dt;
    if (hudAcc < HUD_RATE) return;
    hudAcc = 0;
    missionManager.publishHud();
    syncBlips();
  },
};
