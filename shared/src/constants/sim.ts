// Simulation + physics timing. Fixed-timestep sim decoupled from a variable render rate.

/** Gameplay/logic tick (ai, spawn, economy). */
export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;

/** Physics step (Rapier). */
export const PHYS_HZ = 60;
export const PHYS_DT = 1 / PHYS_HZ;

/** Clamp the accumulator so a GC/tab-stall never triggers a spiral of death. */
export const MAX_SUBSTEPS = 5;
