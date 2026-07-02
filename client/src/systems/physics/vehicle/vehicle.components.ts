// ECS augmentation for the physics/vehicle subsystem (declaration merging — see the contract
// in @sunbreak/shared → ecs/components.ts). Every field is prefixed `veh_` to avoid collisions
// with the ~36 sibling subsystems, and every field is optional / a presence-tag because each
// entity only ever holds a Partial of SimComponents.
//
// These are the shared, serializable POJO channels the vehicle-gameplay subsystem uses to
// drive physics (`veh_input`, `veh_engineHealth`) and read it back (`veh_state`). Live
// THREE/Rapier refs are NOT stored here — they live on the standard `three`/`rigidBody` view
// components plus the module-local handle registry (see runtime.ts), keeping sim data clean.
import type { DriverInput, VehicleState, VehicleConfig, VehicleSpawnRequest } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Presence tag: this entity is a physics-simulated vehicle (rendered by the bridge). */
    veh_isVehicle?: true;
    /** Spawn request placed by gameplay; consumed by physics to build the chassis + wheels. */
    veh_spawnRequest?: VehicleSpawnRequest;
    /** Resolved handling/config profile for this vehicle. */
    veh_config?: VehicleConfig;
    /** Driver intent, written every frame by vehicle-gameplay; read by physics each step. */
    veh_input?: DriverInput;
    /** Telemetry, written every physics step by physics; read by HUD / audio / gameplay. */
    veh_state?: VehicleState;
    /** 0..1 engine-force multiplier for damage coupling (written by gameplay's damage model). */
    veh_engineHealth?: number;
  }
}

export {};
