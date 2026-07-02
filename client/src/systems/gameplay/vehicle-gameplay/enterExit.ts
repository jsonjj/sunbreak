// Enter/exit: proximity detection, the OnFoot→Driving→OnFoot occupancy FSM, and the driver-door
// exit point. We read the interact edge (F / gamepad Y) from the SHARED input snapshot and
// surface the "Press F" prompt through the shared UI store. Occupancy is authored on the player
// entity as `vg_occupant` and mirrored into the reactive vehicle store for HUD/camera/missions.

import { InputAction, VehicleId, type Vec3 } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useUiStore } from "@/stores/ui.store";
import { ENTER_RADIUS, getSeat, getSpec } from "./config";
import { getPlayer, getVehicle, vgQueries } from "./queries";
import { freezePlayer, unfreezePlayer } from "./playerBridge";
import { useVehicleStore } from "./store";
import type { SeatId } from "./types";
import { localToWorld, planarDist } from "./util";

const ENTER_PROMPT = "Press F — Enter vehicle";
let promptShown = false;

function showPrompt(show: boolean): void {
  if (show === promptShown) return;
  useUiStore.getState().setContextPrompt(show ? ENTER_PROMPT : null);
  promptShown = show;
}

function enterVehicle(player: ClientEntity, vehicle: ClientEntity): void {
  const netId = vehicle.netId;
  if (netId === undefined) return;
  const seat: SeatId = "driver";

  if (player.vg_occupant) {
    player.vg_occupant.vehicleNetId = netId;
    player.vg_occupant.seat = seat;
  } else {
    world.addComponent(player, "vg_occupant", { vehicleNetId: netId, seat });
  }

  if (vehicle.vehicle) {
    vehicle.vehicle.engineOn = true;
    const pid = player.netId;
    if (pid !== undefined && !vehicle.vehicle.occupants.includes(pid)) {
      vehicle.vehicle.occupants.push(pid);
    }
  }
  if (vehicle.veh_input) vehicle.veh_input.handbrake = false; // release parked brake

  freezePlayer(player);
  showPrompt(false);
  useVehicleStore.getState().patch({
    fsm: "driving",
    occupancy: { vehicleNetId: netId, seat },
    activeVehicleId: netId,
    nearbyVehicleId: null,
  });
}

function exitVehicle(player: ClientEntity, seat: SeatId, vehicleNetId: number): void {
  const vehicle = getVehicle(vehicleNetId);
  let exitWorld: Vec3 | undefined;
  if (vehicle?.transform) {
    const spec = getSpec(vehicle.veh_spec ?? VehicleId.Sedan);
    const cfg = getSeat(spec, seat);
    exitWorld = localToWorld(cfg.exit, vehicle.transform.position, vehicle.transform.rotation);
  }
  if (vehicle?.vehicle) {
    vehicle.vehicle.engineOn = false;
    const pid = player.netId;
    if (pid !== undefined) {
      vehicle.vehicle.occupants = vehicle.vehicle.occupants.filter((id) => id !== pid);
    }
  }
  if (vehicle?.veh_input) {
    const di = vehicle.veh_input;
    di.throttle = 0;
    di.brake = 0;
    di.steer = 0;
    di.reverse = false;
    di.handbrake = true; // re-park
  }

  if (player.vg_occupant) world.removeComponent(player, "vg_occupant");
  unfreezePlayer(player, exitWorld);
  useVehicleStore.getState().patch({ fsm: "onFoot", occupancy: null, activeVehicleId: null });
}

/** Update phase: run proximity + the interact-key FSM. */
export function enterExitSystem(): void {
  const player = getPlayer();
  if (!player?.transform) {
    showPrompt(false);
    return;
  }
  const pressEnter = input.snapshot.justPressed.has(InputAction.EnterExitVehicle);
  const occ = player.vg_occupant;

  if (occ) {
    showPrompt(false);
    if (pressEnter) exitVehicle(player, occ.seat, occ.vehicleNetId);
    return;
  }

  // On foot: nearest non-wrecked vehicle within reach.
  let nearest: ClientEntity | undefined;
  let best = ENTER_RADIUS;
  for (const v of vgQueries.vehicles.entities) {
    if (!v.transform || v.netId === undefined) continue;
    if (v.vg_health?.stage === "wrecked") continue;
    const d = planarDist(player.transform.position, v.transform.position);
    if (d < best) {
      best = d;
      nearest = v;
    }
  }

  const nearId = nearest?.netId ?? null;
  const store = useVehicleStore.getState();
  if (nearId !== store.nearbyVehicleId) store.patch({ nearbyVehicleId: nearId });
  showPrompt(nearest !== undefined);

  if (pressEnter && nearest) enterVehicle(player, nearest);
}

/** Cleanup: drop the prompt + occupancy so re-registration starts clean. */
export function resetEnterExit(): void {
  showPrompt(false);
  const player = getPlayer();
  if (player?.vg_occupant) {
    world.removeComponent(player, "vg_occupant");
    unfreezePlayer(player);
  }
}
