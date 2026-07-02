// content/debug-tools (client) — dev overlays, tuning, ECS inspector, and cheats.
//
// Implements gta6-build/08-content/debug-tools.md, adapted to the Wave-2 subsystem contract:
// everything lives in this folder, self-registers here, uses only pre-installed deps
// (r3f-perf, leva), and is gated behind `?debug` (or a dev build / persisted flag) with the
// heavy panels behind dynamic imports so they tree-shake out of a normal production bundle.
//
// Integrator wiring (do NOT hand-mount into App from here):
//   • <DebugCanvas/>  — mount INSIDE the R3F <Canvas> (in-canvas overlay + spawned-entity bridge)
//   • <DebugPanels/>  — mount OUTSIDE the <Canvas>, as a DOM sibling of the HUD
// Both self-gate (render null unless debug is enabled), so they are safe to mount in every build.

import "./debug.components"; // ECS `dbg_*` augmentation (side-effect: keeps the module in-graph)
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import { debugEnabled } from "./enabled";
import { dbgSystems } from "./systems/dbgSystems";
import { installHotkeys } from "./hotkeys";
import { registerBuiltinCommands } from "./console/commands";

type W = typeof world;

const active = debugEnabled();

/** The subsystem module. When debug is off (normal production) it registers nothing to run. */
export const debugTools: SubsystemModule<W> = {
  id: "content/debug-tools",
  systems: active ? dbgSystems : [],
  init: active
    ? () => {
        registerBuiltinCommands();
        const removeHotkeys = installHotkeys();
        return () => {
          removeHotkeys();
        };
      }
    : undefined,
};

registerModule(debugTools); // required self-registration side effect

// ── Public API + integrator mount points ────────────────────────────────────────────────
export { DebugCanvas } from "./overlay/DebugCanvas";
export { DebugPanels } from "./panels/DebugPanels";
export { useDebugStore } from "./store/debugStore";
export { useTuningStore, tuningDefaults } from "./store/tuningStore";
export { registerCommand, execute, commandNames } from "./console/commands";
export { cheats } from "./cheats/cheats";
export { debugEnabled, enableDebug } from "./enabled";

export type { DbgSpawnKind } from "./debug.components";
export type { DebugState, PerfMetrics, OverlayMode, DebugToggle } from "./store/debugStore";
export type { TuningState, TuningGroups } from "./store/tuningStore";
export type { DebugCommand } from "./console/commands";
export type { Cheats } from "./cheats/cheats";
