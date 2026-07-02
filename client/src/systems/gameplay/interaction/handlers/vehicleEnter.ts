// Built-in `vehicle_enter` handler. Hides the prompt when every seat is taken (read straight from
// the vehicle's ECS component); on interact it emits `vehicle_enter` for the Vehicles subsystem to
// consume. Vehicles may instead `registerHandler({ kind: "vehicle_enter", … })` to fully own it.

import type { InteractionHandler, PromptData } from "../types";
import { SECONDARY_KEY_GLYPH } from "../constants";

export interface VehicleEnterData {
  /** Net id of the vehicle to enter (defaults to the entity's own netId). */
  vehicleNetId?: number;
  /** Seat index to occupy. Default 0 (driver). */
  seat?: number;
}

export const vehicleEnterHandler: InteractionHandler = {
  kind: "vehicle_enter",
  defaultRange: 3.0,

  getPrompt(ctx): PromptData | null {
    const veh = ctx.entity.vehicle;
    if (veh && veh.seats > 0 && (veh.occupants?.length ?? 0) >= veh.seats) return null; // full
    const cfg = ctx.config;
    return {
      // Vehicle enter/exit is the SECONDARY (Enter/Exit Vehicle = F) action, NOT the generic
      // primary Interact (E). Default to the F glyph so this handler can never render a
      // conflicting "E" prompt for a vehicle.
      key: cfg.key ?? SECONDARY_KEY_GLYPH,
      verb: cfg.verb || "Enter",
      label: cfg.label ?? (veh?.id != null ? String(veh.id) : undefined),
      hold: cfg.hold,
    };
  },

  onInteract(ctx): void {
    const data = (ctx.config.data ?? {}) as VehicleEnterData;
    ctx.events.emit("vehicle_enter", {
      entity: ctx.entity,
      vehicleNetId: data.vehicleNetId ?? ctx.entity.netId ?? null,
      seat: data.seat ?? 0,
    });
  },
};
