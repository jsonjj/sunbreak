// Keeps the (fallback) audio listener glued to the player each frame so positional voices pan
// correctly. When the real `audio/engine` backend is active it owns the listener (synced to the
// camera per its design), so we skip — this only drives our built-in fallback backend.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { getBackend } from "../runtime";

const players = world.with("isPlayer", "transform");

const UP = { x: 0, y: 1, z: 0 };
const RATE = 1 / 30; // ~30 Hz is plenty for listener updates
let acc = 0;

export const listenerSyncSystem: System<typeof world> = {
  name: "sfx.listenerSync",
  phase: "render",
  order: 0,
  fn: (_w, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;

    const backend = getBackend();
    if (backend.kind !== "fallback") return; // engine drives its own listener

    const player = players.entities[0];
    if (!player?.transform) return;

    const pos = player.transform.position;
    const facing = player.movement?.facing ?? 0;
    const forward = { x: Math.sin(facing), y: 0, z: Math.cos(facing) };
    backend.setListener(pos, forward, UP);
  },
};
