// Reads the local player transform/heading/speed from the ECS (per protocol — position comes from
// the ECS, never a hand-mounted ref). One cached query + one reused snapshot: zero per-frame alloc.
import { world } from "@/ecs/world";
import { yawFromQuat } from "../lib/quat";
import type { PlayerCam } from "./types";

const players = world.with("isPlayer", "transform");

const cam: PlayerCam = { x: 0, y: 0, z: 0, heading: 0, speed: 0, valid: false };

/** Live player snapshot. Callers consume immediately (it is mutated in place). */
export function readPlayerCam(): PlayerCam {
  // Prefer the local player; fall back to the first player entity (single-player).
  let e = players.first;
  for (const p of players) {
    if (p.isLocal) {
      e = p;
      break;
    }
  }

  if (!e) {
    cam.valid = false;
    return cam;
  }

  const pos = e.transform.position;
  cam.x = pos.x;
  cam.y = pos.y;
  cam.z = pos.z;
  cam.heading =
    typeof e.movement?.facing === "number" ? e.movement.facing : yawFromQuat(e.transform.rotation);
  cam.speed = e.movement?.speed ?? 0;
  cam.valid = true;
  return cam;
}
