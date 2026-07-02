// Decoupled game-event bus for discrete "fire once" sounds (gunfire, UI, pickups, stingers)
// that can't be derived from ECS component state. Component-derived sounds (footsteps, engine
// RPM, damage) are polled directly from the world by the systems and need NOTHING here.
//
// The bus is published to a STABLE global (`globalThis.__SUNBREAK_SFX__`) so any subsystem can
// emit into it without importing this folder (avoids Wave-2 cross-folder coupling). If another
// module already created it, we reuse that instance.

import mitt, { type Emitter } from "mitt";
import type { PlayOptions, SfxSurface } from "./types";
import type { SoundEventId } from "./catalog";
import type { Vec3, WeaponId } from "@sunbreak/shared";

export type UiSfxKind =
  | "click"
  | "hover"
  | "confirm"
  | "cancel"
  | "error"
  | "open"
  | "close"
  | "notification"
  | "map_ping"
  | "checkpoint"
  | "phone_ring"
  | "phone_tap";

export type VehicleSfxKind =
  | "horn"
  | "door_open"
  | "door_close"
  | "collision_soft"
  | "collision_hard"
  | "glass"
  | "ignition"
  | "shutdown"
  | "screech";

export type PickupSfxKind = "cash" | "ammo" | "health";

/** Bullet-impact materials (ground surfaces plus glass/flesh). */
export type ImpactMaterial = SfxSurface | "glass" | "flesh";

/** Semantic events publishers emit; `listeners.ts` maps them to catalog ids. */
export type SfxBusEvents = {
  /** Generic escape hatch: play any catalog id directly. */
  play: { id: SoundEventId } & PlayOptions;
  gunfire: { weapon?: WeaponId | string; position?: Vec3 };
  reload: { weapon?: WeaponId | string; position?: Vec3 };
  impact: { material?: ImpactMaterial; position?: Vec3; hard?: boolean };
  explosion: { position?: Vec3 };
  vehicle: { kind: VehicleSfxKind; position?: Vec3 };
  ui: { kind: UiSfxKind };
  pickup: { kind: PickupSfxKind; position?: Vec3 };
  wanted: { level: number };
  mission: { phase: "start" | "complete" | "failed" };
};

declare global {
  // eslint-disable-next-line no-var
  var __SUNBREAK_SFX__: Emitter<SfxBusEvents> | undefined;
}

const g = globalThis as typeof globalThis & { __SUNBREAK_SFX__?: Emitter<SfxBusEvents> };

/** The shared SFX event bus (singleton across the app). */
export const sfxBus: Emitter<SfxBusEvents> = g.__SUNBREAK_SFX__ ?? mitt<SfxBusEvents>();
g.__SUNBREAK_SFX__ = sfxBus;

/** Convenience: play any catalog sound by id. */
export function emitSfx(id: SoundEventId, opts: PlayOptions = {}): void {
  sfxBus.emit("play", { id, ...opts });
}
