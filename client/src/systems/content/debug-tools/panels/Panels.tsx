// DOM panel composition (heavy — imports leva). Loaded lazily by <DebugPanels> only when the
// debug layer is enabled, so leva stays out of a normal production bundle. Mount OUTSIDE the
// R3F <Canvas> (a DOM sibling), e.g. next to the HUD.

import { Leva } from "leva";
import { useDebugStore } from "../store/debugStore";
import { LevaControls } from "./LevaControls";
import { EntityInspector } from "./EntityInspector";
import { DevConsole } from "./DevConsole";
import { PerfHud } from "./PerfHud";
import { CheatBar } from "./CheatBar";
import { Z_BASE } from "./ui";

export default function Panels() {
  const inspector = useDebugStore((s) => s.inspector);
  const leva = useDebugStore((s) => s.leva);

  return (
    <>
      {/* Leva mounts its own portal on <body>; keep it registered so tuning persists, but hide
          the visible panel unless toggled on. */}
      <div style={{ position: "fixed", top: 56, right: 12, zIndex: Z_BASE, width: 300 }}>
        <Leva hidden={!leva} collapsed fill titleBar={{ title: "SUNBREAK · Tuning" }} />
      </div>
      <LevaControls />
      <CheatBar />
      <PerfHud />
      {inspector && <EntityInspector />}
      <DevConsole />
    </>
  );
}
