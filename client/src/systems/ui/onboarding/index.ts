// ui/onboarding — first-run tutorial, contextual hints, the scripted "First Gear" intro
// (walk → drive → shoot), and a Help/Controls overlay. Self-registers via registerModule; the
// integrator mounts the exported components. See the bottom of this file for the public API.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./onboarding.components"; // load the ECS `onb_*` augmentation into the module graph

import { probeSystem } from "./probe";
import { runnerSystem, initController, installHelpHotkey } from "./runner";
import { seedDefaultHints } from "./hints";
import { registerMission } from "./mission/missionApi";
import { firstGear } from "./mission/firstGear";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "ui/onboarding",
  systems: [
    // Synthesise bus events from the real input singleton (runs before the runner).
    { name: "onboarding:probe", phase: "update", order: -100, fn: probeSystem },
    // Drive the tutorial/mission state machine + hint timers + zone triggers.
    { name: "onboarding:runner", phase: "update", order: 0, fn: runnerSystem },
  ],
  init() {
    seedDefaultHints();
    registerMission(firstGear);
    const offBus = initController();
    const offHotkey = installHelpHotkey();
    return () => {
      offBus();
      offHotkey();
    };
  },
};

registerModule(mod); // required self-registration side effect

/** Back-compat alias (the original stub exported `onboarding`). */
export const onboarding = mod;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — imported by the integrator and by producer subsystems.
// ─────────────────────────────────────────────────────────────────────────────
// UI the integrator mounts:
export { OnboardingOverlay } from "./components/OnboardingOverlay"; // DOM sibling of <HUD/>
export { HelpControlsScreen } from "./components/HelpControlsScreen"; // pause/F1 Help overlay
export { OnboardingCanvasLayer } from "./components/CanvasLayer"; // OPTIONAL, inside <Canvas>

// State + flow controls:
export { useOnboardingStore } from "./store";
export { replayOnboarding, skipOnboarding } from "./runner";

// Contextual-hint API (any subsystem can queue a hint):
export { registerHint, unregisterHint } from "./hints";
export type { HintDef } from "./hints";

// Event bus (producers emit; onboarding consumes):
export { bus, emitGameEvent, EVENT_KEYS } from "./bus";
export type { OnbGameEvents, OnbEventKey, MoveDir } from "./bus";

// Mission-authoring API (author intros as data; bridges to gameplay/missions when ready):
export { defineMission, registerMission, getMission, allMissions } from "./mission/missionApi";
export type { MissionScript, MissionBeat, MissionHost } from "./mission/missionApi";
export { firstGear } from "./mission/firstGear";
