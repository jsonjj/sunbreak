// The driving system. Each frame it:
//   1. reads current (signed) speed for every vehicle and mirrors it onto `vehicle.speedKmh`,
//   2. for the vehicle the local player DRIVES, turns raw input → assisted DriverInput and writes
//      it to the shared `veh_driverInput` component (the seam vehicle-physics consumes).
// Physics applies that intent to its Rapier controller inside its own useBeforePhysicsStep — so
// there is no physics-step timing needed here; a one-frame handoff latency is imperceptible.

import { VehicleId } from "@sunbreak/shared";
import { getPlayer, vgQueries } from "./queries";
import { readDriverAxes } from "./driverInput";
import { applyAssists, newAssistState, type AssistState } from "./driverAssist";
import { applyBoatControls, applyFlightControls, resetFlightDrive } from "./flightDrive";
import { readSpeed } from "./speed";
import { getSpec } from "./config";

const steerStates = new Map<number, AssistState>();

const steerState = (netId: number): AssistState => {
  let s = steerStates.get(netId);
  if (!s) {
    s = newAssistState();
    steerStates.set(netId, s);
  }
  return s;
};

export function driveSystem(_world: unknown, dt: number): void {
  const player = getPlayer();
  const occ = player?.vg_occupant;
  const drivenId = occ && occ.seat === "driver" ? occ.vehicleNetId : null;

  // While seated, suppress the (frozen) character's on-foot locomotion so the shared
  // hudSyncSystem stops writing a phantom walking speed and animation stays idle. The v0
  // controller re-sets this each physics step; we re-zero it here (update runs after physics,
  // before finish) so the value the HUD reads this frame is 0.
  if (occ && player?.movement) {
    player.movement.speed = 0;
    player.movement.normalizedSpeed = 0;
    player.movement.mode = "idle";
  }

  for (const v of vgQueries.vehicles.entities) {
    const reading = readSpeed(v, dt);
    if (v.vehicle) v.vehicle.speedKmh = reading.speedKmh;

    if (
      drivenId !== null &&
      v.netId === drivenId &&
      v.veh_input &&
      v.vg_health?.stage !== "wrecked"
    ) {
      // Locomotion family decides the control model. `veh_config.kind` is populated by physics'
      // spawn intake; on the rare first frame before that it defaults to the ground-car path.
      const kind = v.veh_config?.kind ?? "car";
      if (kind === "heli" || kind === "plane") {
        applyFlightControls(v.veh_input, drivenId, kind === "plane", dt);
      } else if (kind === "boat") {
        applyBoatControls(v.veh_input, drivenId, dt);
      } else {
        const spec = getSpec(v.veh_spec ?? VehicleId.Sedan);
        const axes = readDriverAxes();
        applyAssists(v.veh_input, axes, reading.forwardKmh, spec.topSpeedKmh, steerState(drivenId), dt);
      }
    }
  }
}

/** Cleanup for init()'s disposer. */
export function resetDrive(): void {
  steerStates.clear();
  resetFlightDrive();
}
