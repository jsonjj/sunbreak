// gameplay/missions — data-driven mission runtime (FSM + director + rewards + markers).
//
// Self-registers via `registerModule` at module top level (the systems-loader imports this file).
// Everything mission-related lives in THIS folder; nothing outside it is edited. Sibling
// subsystems integrate through the exported bus + adapters (see the wiring notes in the report).

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

import "./mission.components"; // ECS augmentation (mission_*)
import "./registry"; // load + validate ./data/*.mission.json on import
import { missionManager } from "./manager";
import { missionUpdateSystem, missionHudSystem } from "./systems";
import { attachSignals } from "./signals";
import { clearBlips } from "./bridges/blips";

type W = typeof world;

export const missions: SubsystemModule<W> = {
  id: "gameplay/missions",
  systems: [missionUpdateSystem, missionHudSystem],
  init() {
    const detachSignals = attachSignals();
    missionManager.init();
    return () => {
      detachSignals();
      missionManager.dispose();
      clearBlips();
    };
  },
};

registerModule(missions);

// ── Public API for HUD / minimap / save / interaction / mission-select + siblings ──
export { missionManager } from "./manager";
export { useMissionStore } from "./store";
export { missionEvents } from "./events";
export { MISSIONS, getMission, allMissions } from "./registry";
export { progress as missionProgress } from "./progress";
export { MissionMarkers } from "./MissionMarkers";

// Integration hooks for sibling subsystems (call to override the built-in defaults):
export { registerMissionEconomy } from "./bridges/economy";
export { registerMissionWanted } from "./bridges/wanted";
export {
  registerCustomAction,
  registerObjectivePredicate,
  registerFailPredicate,
} from "./registries";

export type { GameEvents } from "./events";
export type {
  MissionDef,
  Stage,
  Objective,
  ObjectiveKind,
  Trigger,
  Action,
  Reward,
  FailState,
  TimerSpec,
  MarkerSpec,
  MedalRule,
  MissionArchetype,
  Vec3 as MissionVec3,
} from "./schema";
export type { MissionStatus } from "./types";
export type {
  HudObjective,
  MissionMarker,
  MissionTimerView,
  MissionProgressEntry,
  MissionSaveSlice,
  Medal,
} from "./store";
