// The shared MissionCtx handed to the runtime, director, objectives and conditions. A single
// instance is fine because only one mission is active at a time (v1–v3).

import { world } from "@/ecs/world";
import { playerCtx } from "./bridges/player";
import { wantedCtx } from "./bridges/wanted";
import { economyCtx } from "./bridges/economy";
import { missionEvents } from "./events";
import type { MissionCtx } from "./types";

export const missionCtx: MissionCtx = {
  world,
  player: playerCtx,
  wanted: wantedCtx,
  economy: economyCtx,
  events: missionEvents,
  now: () => performance.now() / 1000,
};
