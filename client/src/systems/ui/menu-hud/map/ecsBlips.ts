// Bridge ECS `hud_blip`-tagged entities → transient MapBlip records with LIVE positions. Drawing
// reuses a scratch object (zero per-frame alloc); click hit-testing collects fresh copies on demand.
import { world } from "@/ecs/world";
import { hudBlipQuery } from "../lib/ecs";
import type { MapBlip } from "./types";

const scratch: MapBlip = {
  id: "",
  x: 0,
  z: 0,
  y: undefined,
  kind: "poi",
  color: undefined,
  label: undefined,
  waypointable: false,
  minimap: true,
  map: true,
  clampToEdge: true,
  priority: 0,
  sonar: false,
};

function fill(target: MapBlip, e: (typeof hudBlipQuery.entities)[number]): MapBlip {
  const t = e.hud_blip!;
  const pos = e.transform.position;
  target.id = `ent:${e.netId ?? world.id(e)}`;
  target.x = pos.x;
  target.z = pos.z;
  target.y = pos.y;
  target.kind = t.kind;
  target.color = t.color;
  target.label = t.label;
  target.waypointable = false;
  target.minimap = t.minimap ?? true;
  target.map = t.map ?? true;
  target.clampToEdge = t.clampToEdge ?? true;
  target.priority = t.priority ?? 0;
  target.sonar = t.sonar ?? false;
  return target;
}

/** Iterate live ECS blips, reusing a scratch record. Consume `b` synchronously inside `cb`. */
export function eachEcsBlip(cb: (b: MapBlip) => void): void {
  for (const e of hudBlipQuery.entities) {
    if (e.hud_blipHidden || !e.hud_blip) continue;
    cb(fill(scratch, e));
  }
}

/** Snapshot ECS blips into fresh objects (for one-off click hit-testing on the full map). */
export function collectEcsBlips(): MapBlip[] {
  const out: MapBlip[] = [];
  for (const e of hudBlipQuery.entities) {
    if (e.hud_blipHidden || !e.hud_blip) continue;
    out.push(fill({ ...scratch }, e));
  }
  return out;
}
