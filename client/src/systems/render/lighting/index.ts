// Subsystem: render/lighting (client) — dynamic day/night lighting, procedural sky + stars, and
// self-generated image-based lighting (IBL), all driven by the shared `light_clock` time value.
// Implements v0 + v1 of gta6-build/01-render/lighting-sky.md. Self-registers on import.
//
// ── How it renders (no hand-mounting into App/Scene) ─────────────────────────────────────────
// init() spawns ONE ECS entity whose `three` view component is a Group holding the sun/moon key
// light, hemisphere + ambient fill, the sky dome, and stars. That group reaches the scene through
// the ECS↔R3F bridge. Registered systems then drive it every frame from `light_clock`/`light_sky`.
//
// ── What the integrator must wire (one-time, generic) ────────────────────────────────────────
//  1. Mount the ECS three-view bridge inside the <Canvas> so entities with a `three` component
//     render, e.g.:
//        <ECS.Entities in={world.with("three")}>{(e) => <primitive object={e.three!} />}</ECS.Entities>
//     (ECS + world come from "@/ecs/world"). This is generic and serves every render subsystem.
//  2. Disable the static v0 <Lighting/> in client/src/render/Scene chain so lighting isn't doubled
//     (two suns / skies / fogs). This subsystem supersedes it.
// The renderer's existing ACES tone mapping + soft shadows are reused as-is (no v0 edits needed).
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import type { world } from "@/ecs/world";
import { LightingRuntime } from "./runtime";

type W = typeof world;

const runtime = new LightingRuntime();

export const lighting: SubsystemModule<W> = {
  id: "render/lighting",
  systems: [
    { name: "lighting/clock", phase: "update", order: -20, fn: (_w, dt) => runtime.tick(dt) },
    { name: "lighting/apply", phase: "render", order: 0, fn: () => runtime.render() },
    { name: "lighting/hud", phase: "finish", order: 10, fn: () => runtime.mirror() },
  ],
  init() {
    runtime.init();
    return () => runtime.dispose();
  },
};

registerModule(lighting);

// Public contracts for consumers (Weather, HUD, gameplay) and integrators.
export { useTimeOfDay, type DayPhase } from "./timeOfDayStore";
export type { LightClock, LightSky } from "./light.components";
