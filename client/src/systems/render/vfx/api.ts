// Public VFX API — the simple, imperative spawn surface for combat / vehicles / weather / any
// system that has a reference (rather than an ECS entity to write onto). Everything funnels
// through the `vfxBus` (mitt) so external observers can also listen; a single listener forwards
// to the manager. Prefer these helpers or the `vfx_emit` ECS component (see components.ts).
import mitt from "mitt";
import { vfxManager, type VfxStats } from "./core/VfxManager";
import { bloomPulse } from "./core/bloom";
import { shake } from "./core/shake";
import type { Vec3Like, VfxEvent, VfxSurface, VfxTier, WeatherState } from "./types";

type VfxBusEvents = {
  spawn: VfxEvent;
};

/** Decoupled event bus. `vfxBus.emit("spawn", event)` is equivalent to `spawnVfx(event)`. */
export const vfxBus = mitt<VfxBusEvents>();
vfxBus.on("spawn", (e) => vfxManager.spawn(e));

/** THE spawn entry point. Fire-and-forget; budget-culled + pooled by the manager. */
export function spawnVfx(event: VfxEvent): void {
  vfxBus.emit("spawn", event);
}

export interface SpawnOpts {
  scale?: number;
  intensity?: number;
  color?: number;
  seed?: number;
  count?: number;
}

export function muzzleFlash(position: Vec3Like, dir?: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "muzzle", position, dir, ...opts });
}

export function impact(
  position: Vec3Like,
  normal?: Vec3Like,
  surface?: VfxSurface,
  opts: SpawnOpts = {},
): void {
  spawnVfx({ type: "impact", position, normal, surface, ...opts });
}

export function explosion(position: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "explosion", position, ...opts });
}

export function skidMark(position: Vec3Like, dir?: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "skid", position, dir, ...opts });
}

export function bloodHit(position: Vec3Like, normal?: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "blood", position, normal, surface: "flesh", ...opts });
}

export function smokePuff(position: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "smoke", position, ...opts });
}

export function dustPuff(position: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "dust", position, ...opts });
}

export function sparkBurst(position: Vec3Like, dir?: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "spark", position, dir, ...opts });
}

export function lightningFlash(position: Vec3Like, opts: SpawnOpts = {}): void {
  spawnVfx({ type: "lightning", position, ...opts });
}

// ── Weather / tiers / signals ───────────────────────────────────────────────────────────

/** Merge into the current weather state (drives rain density + wetness). */
export function setWeather(patch: Partial<WeatherState>): void {
  const cur = vfxManager.getWeather();
  vfxManager.setWeather({
    rain: patch.rain ?? cur.rain,
    wind: patch.wind ?? cur.wind,
    cat: patch.cat ?? cur.cat,
    wetness: patch.wetness ?? cur.wetness,
  });
}

/** Convenience: set rain intensity 0..1 (keeps current wind). */
export function setRain(intensity: number): void {
  setWeather({ rain: intensity });
}

export function setWind(x: number, y: number, z: number): void {
  setWeather({ wind: { x, y, z } });
}

/** Manual VFX tier override (LOW/MED/HIGH) — disables auto-follow of the quality store. */
export function setVfxTier(tier: VfxTier): void {
  vfxManager.setTier(tier);
}

export function setVfxAutoTier(on: boolean): void {
  vfxManager.setAutoTier(on);
}

export function getVfxStats(): VfxStats {
  return vfxManager.stats;
}

/** Signals other subsystems can subscribe to (postprocessing bloom, camera shake). */
export { bloomPulse, shake };
export { vfxManager };
