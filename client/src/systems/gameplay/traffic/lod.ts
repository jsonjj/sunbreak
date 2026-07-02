// Representation LOD + adaptive governor. Each car gets a tier by distance to the camera:
//   L0 (<30 m)  full sim + kinematic physics body
//   L1 (<72 m)  kinematic body, instanced-style render
//   L2 (<132 m) ECS-only, round-robin ~6 Hz (temporal spreading)
//   Cull        beyond → invisible, minimal sim
// The governor watches smoothed frame time and trims the population cap + L0 count under load.
import { LOD0, LOD1, LOD2 } from "./config";
import { state } from "./state";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { CarLod } from "./types";

const BUDGET_S = 1 / 55; // aim to stay above ~55 fps
const HYSTERESIS = 0.0025;

export function updateLod(cars: readonly ClientEntity[]): void {
  const v = state.view;
  const cx = v.hasCamera ? v.camX : v.px;
  const cz = v.hasCamera ? v.camZ : v.pz;
  const cy = v.hasCamera ? v.camY : v.py + 1.5;
  for (const e of cars) {
    const c = e.traffic_car!;
    const t = e.transform!;
    const dx = t.position.x - cx;
    const dy = t.position.y - cy;
    const dz = t.position.z - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let lod: CarLod;
    if (d < LOD0) lod = 0;
    else if (d < LOD1) lod = 1;
    else if (d < LOD2) lod = 2;
    else lod = 3;
    c.lod = lod;
    if (e.three) e.three.visible = lod < 3;
  }
}

/** Feed the render frame dt to the governor; nudges the cap scale up/down with hysteresis. */
export function tickGovernor(dt: number): void {
  const g = state.governor;
  g.dtEma += (dt - g.dtEma) * 0.1;
  if (g.dtEma > BUDGET_S + HYSTERESIS) g.capScale = Math.max(0.4, g.capScale - 0.02);
  else if (g.dtEma < BUDGET_S - HYSTERESIS) g.capScale = Math.min(1, g.capScale + 0.01);
}
