// Zustand view/session state for vehicles. Two surfaces, matching the perf contract:
//   • useVehicleStore — reactive occupancy/FSM + a HUD snapshot throttled to ~12 Hz.
//   • hudRef          — a MUTABLE object updated every frame; read it inside a useFrame (e.g. a
//                       speedometer widget) to avoid per-frame React re-renders.
// The canonical `speedKmh`/`inVehicle` still go to the shared HUD store (see hud.ts).

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { SeatId, VehicleHudSnapshot } from "./types";
import { emptyVehicleHud } from "./types";

export type VgFsm = "onFoot" | "entering" | "driving" | "exiting";

export interface Occupancy {
  vehicleNetId: number;
  seat: SeatId;
}

interface VgStoreState {
  fsm: VgFsm;
  occupancy: Occupancy | null;
  activeVehicleId: number | null;
  nearbyVehicleId: number | null;
  hud: VehicleHudSnapshot;
  patch: (p: Partial<Omit<VgStoreState, "patch">>) => void;
}

export const useVehicleStore = create<VgStoreState>()(
  subscribeWithSelector((set) => ({
    fsm: "onFoot",
    occupancy: null,
    activeVehicleId: null,
    nearbyVehicleId: null,
    hud: emptyVehicleHud(),
    patch: (p) => set(p),
  })),
);

/** Non-reactive, per-frame HUD mirror. Mutate fields in place; never reassign the reference. */
export const hudRef: VehicleHudSnapshot = emptyVehicleHud();

// ── Selectors exposed to HUD/other consumers ─────────────────────────────────────────────
export const useVehicleHud = (): VehicleHudSnapshot => useVehicleStore((s) => s.hud);
export const useVehicleOccupancy = (): Occupancy | null => useVehicleStore((s) => s.occupancy);
export const useIsInVehicle = (): boolean => useVehicleStore((s) => s.occupancy !== null);

/** Imperative reset used by init()/cleanup so re-registration starts from a clean slate. */
export const resetVehicleStore = (): void => {
  Object.assign(hudRef, emptyVehicleHud());
  useVehicleStore.getState().patch({
    fsm: "onFoot",
    occupancy: null,
    activeVehicleId: null,
    nearbyVehicleId: null,
    hud: emptyVehicleHud(),
  });
};
