// Wet-road grip signal for the vehicle physics subsystem. We publish `roadGrip` +
// `sideFrictionScale` on `time_effects`; this helper applies them to a Rapier
// raycast-vehicle controller's wheels. Structurally typed so we don't hard-depend
// on @react-three/rapier's exact controller type (which physics/vehicle owns).

import { useFrame } from "@react-three/fiber";
import { getEffects } from "./singleton";
import type { EnvEffects } from "./types";

/** Dry-road baselines — align these with physics/vehicle's wheel tuning. */
export const BASE_WHEEL_FRICTION_SLIP = 1.2;
export const BASE_SIDE_FRICTION_STIFFNESS = 1.0;

/** The subset of the Rapier vehicle controller we need. */
export interface WheelFrictionController {
  setWheelFrictionSlip(index: number, value: number): void;
  setWheelSideFrictionStiffness?(index: number, value: number): void;
}

export interface GripOptions {
  /** Number of wheels to update (default 4). */
  wheels?: number;
  /** Dry longitudinal slip baseline (default BASE_WHEEL_FRICTION_SLIP). */
  baseSlip?: number;
  /** Dry lateral stiffness baseline (default BASE_SIDE_FRICTION_STIFFNESS). */
  baseSide?: number;
}

/** Longitudinal wheel friction for the current conditions. */
export function computeWheelFriction(effects: EnvEffects, baseSlip = BASE_WHEEL_FRICTION_SLIP): number {
  return baseSlip * effects.roadGrip;
}

/** Apply wet-road friction to every wheel of a controller (call once per frame). */
export function applyGripToController(
  controller: WheelFrictionController,
  effects: EnvEffects,
  opts: GripOptions = {},
): void {
  const wheels = opts.wheels ?? 4;
  const baseSlip = opts.baseSlip ?? BASE_WHEEL_FRICTION_SLIP;
  const baseSide = opts.baseSide ?? BASE_SIDE_FRICTION_STIFFNESS;
  const slip = baseSlip * effects.roadGrip;
  const side = baseSide * effects.sideFrictionScale;
  for (let i = 0; i < wheels; i++) {
    controller.setWheelFrictionSlip(i, slip);
    controller.setWheelSideFrictionStiffness?.(i, side);
  }
}

/**
 * Drop-in hook for the vehicle component: pass a getter for your live controller
 * (e.g. `useVehicleController(...).controller`). Reads the wet-grip signal each
 * frame and applies it — no re-render, no store subscription.
 */
export function useWetRoadGrip(
  getController: () => WheelFrictionController | null | undefined,
  opts: GripOptions = {},
): void {
  useFrame(() => {
    const controller = getController();
    if (!controller) return;
    applyGripToController(controller, getEffects(), opts);
  });
}
