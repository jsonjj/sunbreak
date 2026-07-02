// HUD bridge (finish phase). Runs AFTER the v0 hudSyncSystem so that, while seated, our vehicle
// speed wins over the (bogus) on-foot speed the frozen character would otherwise report.
//   • hudRef            — updated EVERY frame (non-reactive) for a useFrame speedometer widget.
//   • useVehicleStore   — reactive rich HUD snapshot, throttled to ~12 Hz.
//   • useHudStore       — canonical shared HUD: speedKmh + inVehicle (what the v0 HUD renders).

import { VehicleId } from "@sunbreak/shared";
import { useHudStore } from "@/stores/hud.store";
import type { ClientEntity } from "@/ecs/clientEntity";
import { HUD_RATE_HZ, IDLE_RPM, MAX_RPM, getSpec } from "./config";
import { getPlayer, getVehicle } from "./queries";
import { hudRef, useVehicleStore } from "./store";
import { clamp01, lerp, MPH_PER_KMH } from "./util";

const RATE = 1 / HUD_RATE_HZ;
let acc = 0;
let lastInVehicle = false;

const gearFromFrac = (frac: number, reverse: boolean | undefined): number => {
  if (reverse) return -1;
  if (frac < 0.01) return 0;
  return Math.min(5, 1 + Math.floor(frac * 5));
};

function writeHudRef(active: boolean, v: ClientEntity | undefined): void {
  hudRef.active = active;
  if (!active || !v) {
    hudRef.spec = null;
    hudRef.speedKmh = 0;
    hudRef.speedMph = 0;
    hudRef.rpm = 0;
    hudRef.gear = 0;
    hudRef.hp01 = 1;
    hudRef.engineHealth01 = 1;
    hudRef.stage = "ok";
    return;
  }
  const spec = getSpec(v.veh_spec ?? VehicleId.Sedan);
  const speedKmh = v.vehicle?.speedKmh ?? v.veh_state?.speedKmh ?? 0;
  const frac = clamp01(speedKmh / Math.max(1, spec.topSpeedKmh));
  hudRef.spec = v.veh_spec ?? null;
  hudRef.speedKmh = speedKmh;
  hudRef.speedMph = speedKmh * MPH_PER_KMH;
  // Physics publishes rpm as a 0..1 value (`rpm01`); map it into the HUD's rpm range.
  hudRef.rpm = v.veh_state
    ? Math.round(lerp(IDLE_RPM, MAX_RPM, v.veh_state.rpm01))
    : Math.round(lerp(IDLE_RPM, MAX_RPM, frac));
  hudRef.gear = v.veh_state?.gear ?? gearFromFrac(frac, v.veh_input?.reverse);
  hudRef.hp01 = v.vg_health ? clamp01(v.vg_health.hp / v.vg_health.maxHp) : 1;
  hudRef.engineHealth01 = v.veh_engineHealth ?? 1;
  hudRef.stage = v.vg_health?.stage ?? "ok";
}

export function vehicleHudSystem(_world: unknown, dt: number): void {
  const player = getPlayer();
  const occ = player?.vg_occupant;
  const inVehicle = occ !== undefined;
  const vehicle = occ ? getVehicle(occ.vehicleNetId) : undefined;

  writeHudRef(inVehicle, vehicle); // cheap, every frame

  acc += dt;
  const due = acc >= RATE;
  if (due) acc = 0;

  const hud = useHudStore.getState();
  if (inVehicle) {
    if (due) {
      hud.patch({ speedKmh: Math.round(hudRef.speedKmh), inVehicle: true });
      useVehicleStore.getState().patch({ hud: { ...hudRef } });
    } else if (!lastInVehicle) {
      hud.patch({ inVehicle: true }); // prompt state change immediately
    }
  } else if (lastInVehicle) {
    // Just left the car: hand speed back to the on-foot hudSyncSystem.
    hud.patch({ inVehicle: false });
    useVehicleStore.getState().patch({ hud: { ...hudRef } });
  }
  lastInVehicle = inVehicle;
}

/** Cleanup for init()'s disposer. */
export function resetHud(): void {
  acc = 0;
  lastInVehicle = false;
  useHudStore.getState().patch({ inVehicle: false });
}
