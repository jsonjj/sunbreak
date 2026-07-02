// Reads the local player transform from the ECS (per the protocol — position comes from the ECS,
// never a hand-mounted ref). One cached miniplex query, one reused snapshot object: zero per-frame
// allocation. Callers consume the returned `PlayerCam` immediately (it is mutated in place).
import { world } from "@/ecs/world";
import type { PlayerCam } from "./mapTypes";

const players = world.with("isPlayer", "transform", "movement");

const cam: PlayerCam = { x: 0, y: 0, z: 0, heading: 0, speed: 0, mode: "idle", valid: false };

export function readPlayerCam(): PlayerCam {
  // Prefer the local player; fall back to the first player entity (single-player v0).
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
  const mv = e.movement;
  cam.x = pos.x;
  cam.y = pos.y;
  cam.z = pos.z;
  cam.heading = mv.facing;
  cam.speed = mv.speed;
  cam.mode = mv.mode;
  cam.valid = true;
  return cam;
}
