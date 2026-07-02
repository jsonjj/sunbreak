// useTuningStore — the live-config source of truth that the Leva panel writes into.
//
// IMPORTANT: gameplay systems should read THIS store (via selectors), not Leva directly, so
// tuning keeps working even when Leva is tree-shaken from a production build. Leva is only the
// editor UI; this store is the data.
//
// Defaults are seeded from the shared tuning constants where they exist so the panel opens at
// the real game values.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  GRAVITY,
  JUMP_SPEED,
  RUN_SPEED,
  SPRINT_SPEED,
  WALK_SPEED,
} from "@sunbreak/shared";

export interface WorldTuning {
  timeOfDay: number; // hours 0..24
  sunIntensity: number;
  fogDensity: number;
}
export interface CameraTuning {
  fov: number;
  distance: number;
  height: number;
  damping: number; // smoothTime seconds
}
export interface PlayerTuning {
  walkSpeed: number;
  runSpeed: number;
  sprintSpeed: number;
  jumpSpeed: number;
}
export interface VehicleTuning {
  engineForce: number;
  brakeForce: number;
  steer: number;
  suspension: number;
}
export interface PhysicsTuning {
  gravityY: number;
  paused: boolean;
  showColliders: boolean;
}
export type RenderQuality = "low" | "medium" | "high";
export interface RenderTuning {
  quality: RenderQuality;
  shadowMapSize: number;
  pixelRatio: number;
}
export interface PostFxTuning {
  bloom: number;
  exposure: number;
}

export interface TuningGroups {
  world: WorldTuning;
  camera: CameraTuning;
  player: PlayerTuning;
  vehicle: VehicleTuning;
  physics: PhysicsTuning;
  render: RenderTuning;
  postfx: PostFxTuning;
}

export interface TuningState extends TuningGroups {
  /** Merge-patch a single group (used by systems / bulk updates). */
  patch: <G extends keyof TuningGroups>(group: G, value: Partial<TuningGroups[G]>) => void;
  /** Dot-path setter (`"player.walkSpeed"`) — convenient for Leva `onChange`. */
  set: (path: string, value: number | string | boolean) => void;
}

const DEFAULTS: TuningGroups = {
  world: { timeOfDay: 12, sunIntensity: 3, fogDensity: 0.015 },
  camera: { fov: 60, distance: 4.5, height: 1.6, damping: 0.18 },
  player: {
    walkSpeed: WALK_SPEED,
    runSpeed: RUN_SPEED,
    sprintSpeed: SPRINT_SPEED,
    jumpSpeed: JUMP_SPEED,
  },
  vehicle: { engineForce: 1600, brakeForce: 2400, steer: 0.6, suspension: 0.3 },
  physics: { gravityY: GRAVITY[1] ?? -9.81, paused: false, showColliders: false },
  render: { quality: "high", shadowMapSize: 2048, pixelRatio: 1.5 },
  postfx: { bloom: 0.6, exposure: 1 },
};

export const useTuningStore = create<TuningState>()(
  subscribeWithSelector((set) => ({
    ...structuredClone(DEFAULTS),
    patch: (group, value) => set((s) => ({ [group]: { ...s[group], ...value } }) as Partial<TuningState>),
    set: (path, value) =>
      set((s) => {
        const dot = path.indexOf(".");
        if (dot < 0) return {};
        const group = path.slice(0, dot) as keyof TuningGroups;
        const key = path.slice(dot + 1);
        const current = s[group];
        if (typeof current !== "object" || current === null) return {};
        return { [group]: { ...current, [key]: value } } as Partial<TuningState>;
      }),
  })),
);

/** The pristine defaults, exposed so a "reset" button / command can restore them. */
export const tuningDefaults = (): TuningGroups => structuredClone(DEFAULTS);
