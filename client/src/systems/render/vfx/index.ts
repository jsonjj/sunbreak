// Subsystem: render/vfx (client) — real-time VFX: muzzle flashes, impacts, explosions, skid
// marks, exhaust/dust, sparks, blood, lightning, and budget-governed baseline rain/weather.
// Implements gta6-build/01-render/vfx.md. Self-registers a single render-phase system that
// drives the VfxManager; renders through an ECS-owned `three` container (see VfxManager) so it
// never hand-mounts into App/Scene. Trigger it via the `spawnVfx` API or the `vfx_emit` ECS
// component (see ./components.ts, ./api.ts).
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./components"; // declaration-merge vfx_* onto SimComponents
import { vfxSystem } from "./system";
import { vfxManager } from "./core/VfxManager";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "render/vfx",
  systems: [vfxSystem],
  init() {
    return () => vfxManager.dispose();
  },
};

registerModule(mod);

// ── Public surface (import from "@/systems/render/vfx") ──────────────────────────────────
export {
  spawnVfx,
  vfxBus,
  muzzleFlash,
  impact,
  explosion,
  skidMark,
  bloodHit,
  smokePuff,
  dustPuff,
  sparkBurst,
  lightningFlash,
  setWeather,
  setRain,
  setWind,
  setVfxTier,
  setVfxAutoTier,
  getVfxStats,
  bloomPulse,
  shake,
  vfxManager,
} from "./api";
export type { SpawnOpts } from "./api";
export type {
  Vec3Like,
  VfxEvent,
  VfxEventType,
  VfxSurface,
  VfxTier,
  WeatherState,
} from "./types";
