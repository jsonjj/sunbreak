// Update-phase system: mirror ECS `map_blip` entities into the blip store (pooled, zero per-frame
// alloc) and drive GPS routing (waypoint change + off-route deviation). Registered from index.ts.
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { getMapState } from "./mapStore";
import { initRouter, tickRouting } from "./routing/router";
import { getBasemap } from "./mapBake";
import type { Blip } from "./mapTypes";

type W = typeof world;

// Cached, live-updated query for every entity that opted into the map (minus hidden ones).
const blipQuery = world.with("map_blip", "transform").without("map_hidden");

let prev = new Set<string>();
let seen = new Set<string>();

function idOf(e: ClientEntity): string {
  const nid = e.netId ?? world.id(e);
  return `ent:${nid ?? "x"}`;
}

function syncEcsBlips(): void {
  const st = getMapState();
  const blips = st.blips;
  seen.clear();

  for (const e of blipQuery) {
    const cfg = e.map_blip;
    const pos = e.transform.position;
    const id = idOf(e);
    seen.add(id);

    const existing = blips.get(id);
    if (existing) {
      // Mutate in place — no store churn, no re-render (the RAF loop reads live positions).
      existing.at.x = pos.x;
      existing.at.z = pos.z;
      existing.height = pos.y;
      existing.style = cfg.style;
      existing.color = cfg.color;
      existing.label = cfg.label;
      existing.minimap = cfg.minimap;
      existing.clampToEdge = cfg.clampToEdge;
      existing.priority = cfg.priority;
      existing.entity = e.netId;
    } else {
      const blip: Blip = {
        id,
        style: cfg.style,
        at: { x: pos.x, z: pos.z },
        height: pos.y,
        entity: e.netId,
        color: cfg.color,
        label: cfg.label,
        minimap: cfg.minimap,
        clampToEdge: cfg.clampToEdge,
        priority: cfg.priority,
      };
      st.upsertBlip(blip); // structural add → bumps blipVersion
    }
  }

  // Drop blips whose backing entity disappeared this frame.
  for (const id of prev) if (!seen.has(id)) st.removeBlip(id);

  const swap = prev;
  prev = seen;
  seen = swap;
}

export const mapUpdateSystem: System<W> = {
  name: "render/map:sync",
  phase: "update",
  order: 60,
  fn: (_w, dt) => {
    syncEcsBlips();
    tickRouting(dt);
  },
};

/** One-time init: prebuild the nav-graph and prebake the basemap off the critical path. */
export function initMap(): () => void {
  initRouter();
  try {
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => getBasemap());
    else getBasemap();
  } catch {
    /* basemap will bake lazily on first draw */
  }
  return () => {
    getMapState().clearBlips((b) => b.id.startsWith("ent:"));
  };
}
