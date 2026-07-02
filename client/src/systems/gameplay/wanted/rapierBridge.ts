// A tiny singleton that hands the live Rapier context (world + RAPIER namespace) from inside
// the R3F <Physics> tree out to the plain-TS systems that run in the SystemRegistry. `WantedView`
// captures it via `useRapier()` on mount and clears it on unmount. LOS gracefully degrades to
// FOV+distance-only when it is absent (e.g. the view component isn't mounted, or on Low quality).
import type { useRapier } from "@react-three/rapier";

export type RapierCtx = ReturnType<typeof useRapier>;

let ctx: RapierCtx | null = null;

export function setRapierCtx(next: RapierCtx | null): void {
  ctx = next;
}

export function getRapierCtx(): RapierCtx | null {
  return ctx;
}
