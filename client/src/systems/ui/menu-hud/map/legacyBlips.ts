// Back-compat bridge: some subsystems (missions, activities) still publish markers into the legacy
// shared `useHudStore().blips: Blip[]` array. We fold those into the minimap + map so nothing
// regresses before the integrator migrates them onto the richer `addBlip(...)` API. The shared
// `BlipKind` is a subset of our `BlipKind`, so kinds map 1:1.
import { useHudStore } from "../lib/stores";
import type { MapBlip } from "./types";

const scratch: MapBlip = {
  id: "",
  x: 0,
  z: 0,
  y: undefined,
  kind: "poi",
  color: undefined,
  label: undefined,
  waypointable: false,
  minimap: true,
  map: true,
  clampToEdge: true,
  priority: 0,
  sonar: false,
};

/** Iterate legacy shared HUD blips, reusing a scratch record (consume synchronously in `cb`). */
export function eachLegacyBlip(cb: (b: MapBlip) => void): void {
  for (const b of useHudStore.getState().blips) {
    scratch.id = `hud:${b.id}`;
    scratch.x = b.x;
    scratch.z = b.z;
    scratch.kind = b.kind;
    scratch.label = b.label;
    cb(scratch);
  }
}

/** Snapshot legacy blips into fresh objects (for the full-map draw pass). */
export function collectLegacyBlips(): MapBlip[] {
  return useHudStore.getState().blips.map((b) => ({
    ...scratch,
    id: `hud:${b.id}`,
    x: b.x,
    z: b.z,
    kind: b.kind,
    label: b.label,
  }));
}
