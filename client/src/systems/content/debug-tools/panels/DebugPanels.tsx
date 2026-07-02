// Integrator mount point (DOM). Mount this OUTSIDE the R3F <Canvas> — as a sibling of the game
// HUD, inside the app root div.
//
// It self-gates: renders nothing unless the debug layer is enabled, and only then lazily loads
// the heavy panels (leva). Safe to mount unconditionally in every build.

import { Suspense, lazy } from "react";
import { debugEnabled } from "../enabled";

const Panels = lazy(() => import("./Panels"));

export function DebugPanels() {
  if (!debugEnabled()) return null;
  return (
    <Suspense fallback={null}>
      <Panels />
    </Suspense>
  );
}
