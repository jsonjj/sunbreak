import type { ReactNode } from "react";
import { Physics } from "@react-three/rapier";
import { GRAVITY, PHYS_DT } from "@sunbreak/shared";

/** Single Rapier physics root: fixed timestep + interpolation for smooth 60fps rendering. */
export function PhysicsProvider({ debug, children }: { debug?: boolean; children: ReactNode }) {
  return (
    <Physics gravity={GRAVITY} timeStep={PHYS_DT} interpolate updateLoop="follow" debug={debug}>
      {children}
    </Physics>
  );
}
