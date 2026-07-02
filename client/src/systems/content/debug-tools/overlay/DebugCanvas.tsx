// Integrator mount point (in-canvas). Mount this INSIDE the R3F <Canvas>.
//
// It self-gates: renders nothing unless the debug layer is enabled, and only then lazily loads
// the heavy canvas layer (r3f-perf). Safe to mount unconditionally in every build.

import { Suspense, lazy } from "react";
import { debugEnabled } from "../enabled";

const CanvasLayer = lazy(() => import("./CanvasLayer"));

export function DebugCanvas() {
  if (!debugEnabled()) return null;
  return (
    <Suspense fallback={null}>
      <CanvasLayer />
    </Suspense>
  );
}
