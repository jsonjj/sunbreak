// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL v1 INTEGRATION — cross-subsystem data funnels + the player avatar.
// ─────────────────────────────────────────────────────────────────────────────
// Owned by the integrator (not a subsystem). Imported ONCE from main.tsx AFTER the
// systems-loader, so every subsystem has already self-registered. Everything here is
// defensive (guarded/try-caught) — nothing may throw at boot.

import { PLAYER_CAPSULE } from "@sunbreak/shared";
import { registerSystem } from "./registry";
import { world } from "../ecs/world";

// Player avatar: a rigged lead attached to the local player entity (its `three` renders through
// the generic ECS↔R3F bridge; the char drive system positions/animates it from transform+movement).
import { attachCharacter, createCharacter } from "@/systems/gameplay/character-content";

// Day/night is the authoritative clock; point look-dev (materials) + weather (vfx) at it.
import { getEnv } from "@/systems/gameplay/daynight";
import { setTimeOfDay as matSetTimeOfDay, setWetness as matSetWetness } from "@/systems/render/materials";
import { setRain as vfxSetRain, setWind as vfxSetWind } from "@/systems/render/vfx";

// Road graph: publish the City-Gen graph so peds + traffic adopt it (both also self-fallback).
import { cityStore, ensureCityMap } from "@/systems/render/city";

/** Capsule center → feet-origin offset so the rig's feet sit on the ground. */
const PLAYER_YOFFSET = -(PLAYER_CAPSULE.halfHeight + PLAYER_CAPSULE.radius);

const localPlayerQ = world.with("isLocal", "transform");
let envAcc = 0;

/** Wire the v1 funnels + avatar. Call once, after the systems-loader, before React renders. */
export function wireIntegration(): void {
  // 1) Attach a lead rig to the local player once it exists, and hide it while seated in a car.
  registerSystem({
    name: "integration:playerAvatar",
    phase: "update",
    order: -900,
    fn: () => {
      for (const e of localPlayerQ.entities) {
        if (e.char_kind === undefined) {
          try {
            attachCharacter(e, createCharacter("cami"), { yOffset: PLAYER_YOFFSET });
          } catch {
            /* rig build failed — player stays unrendered; the rest of the world is unaffected */
          }
        }
        if (e.three) e.three.visible = e.vg_occupant === undefined; // hide on-foot rig while driving
      }
    },
  });

  // 2) Day/night → materials look-dev + vfx weather (throttled). daynight owns the clock; these
  //    consumers only READ it here instead of self-advancing separate clocks.
  registerSystem({
    name: "integration:envFunnel",
    phase: "render",
    order: 200,
    fn: (_w, dt) => {
      envAcc += dt;
      if (envAcc < 0.1) return;
      envAcc = 0;
      const env = getEnv();
      if (!env) return;
      try {
        matSetTimeOfDay(env.tod01);
        matSetWetness(env.wetness);
        vfxSetRain(env.rain);
        vfxSetWind(env.wind[0], env.wind[1] ?? 0, env.wind[2]);
      } catch {
        /* best-effort look-dev funnel */
      }
    },
  });

  // 3) Road-graph funnel: publish the city graph on the untyped window seam peds + traffic already
  //    listen on (peds: `__SUNBREAK_ROAD_GRAPH__` + the ready event; traffic: `__SUNBREAK_CITY__`).
  try {
    ensureCityMap();
    const graph = cityStore.roadGraph;
    if (graph && typeof window !== "undefined") {
      const w = window as unknown as {
        __SUNBREAK_ROAD_GRAPH__?: unknown;
        __SUNBREAK_CITY__?: { getRoadGraph?: () => unknown; roadGraph?: unknown };
      };
      w.__SUNBREAK_ROAD_GRAPH__ = graph;
      w.__SUNBREAK_CITY__ = { getRoadGraph: () => graph, roadGraph: graph };
      window.dispatchEvent(new CustomEvent("sunbreak:roadgraph-ready", { detail: graph }));
    }
  } catch {
    /* city not ready / shape mismatch — peds + traffic use their procedural grids */
  }
}
