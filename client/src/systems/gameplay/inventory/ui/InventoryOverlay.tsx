// One-line mount for the integrator: the weapon wheel + the ammo HUD counter. Drop this next to
// <HUD/> in App.tsx (outside the R3F <Canvas>). Prefer mounting <WeaponWheel/> / <AmmoCounter/>
// individually if the HUD already renders its own ammo readout.

import type { ReactElement } from "react";
import { WeaponWheel } from "./WeaponWheel";
import { AmmoCounter } from "./AmmoCounter";

export function InventoryOverlay(): ReactElement {
  return (
    <>
      <AmmoCounter />
      <WeaponWheel />
    </>
  );
}
