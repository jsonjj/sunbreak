// Reactions to the player + police. Sets each car's high-level driving state (cruise / pullover /
// panic) that the car-following step then obeys, and projects the player onto a car's lane corridor
// so IDM treats a player-in-the-road (on foot or in a slow car) as a virtual lead → brake/stop.
import { clamp, scratchB } from "./math";
import { sampleLane } from "./laneGraph";
import { state } from "./state";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { LaneGraph } from "./types";

const PULLOVER_LATERAL = 1.3; // metres toward the right kerb
const PANIC_SPEED_MULT = 1.35;
const PLAYER_IGNORE_AHEAD = 34; // metres

/** Apply police escalation state to every ambient car (reads the wanted provider). */
export function updatePoliceReactions(cars: readonly ClientEntity[]): void {
  const stars = state.providers.wanted?.() ?? 0;
  const sirenNear = state.providers.sirenNear;
  for (const e of cars) {
    const c = e.traffic_car!;
    if (c.dynamic || c.state === "wreck") continue;
    const t = e.transform!;
    const alert =
      stars > 0 && (sirenNear ? sirenNear(t.position.x, t.position.z) : nearPlayer(t.position.x, t.position.z, 60));
    if (alert && stars >= 3) {
      c.state = "panic";
      c.ignoreSignals = true;
      c.desiredSpeed = c.baseSpeed * PANIC_SPEED_MULT;
      c.targetLateral = 0;
    } else if (alert) {
      c.state = "pullover";
      c.ignoreSignals = false;
      c.desiredSpeed = 0;
      c.targetLateral = PULLOVER_LATERAL;
    } else {
      if (c.state === "pullover" || c.state === "panic") c.state = "cruise";
      c.ignoreSignals = false;
      c.desiredSpeed = c.baseSpeed;
      c.targetLateral = 0;
    }
  }
}

function nearPlayer(x: number, z: number, r: number): boolean {
  const dx = x - state.view.px;
  const dz = z - state.view.pz;
  return dx * dx + dz * dz < r * r;
}

/**
 * Project the player onto `car`'s lane corridor. Returns a virtual lead (gap + leadSpeed) when the
 * player is ahead within braking distance and inside the lane width, else null.
 */
export function playerObstacle(
  graph: LaneGraph,
  entity: ClientEntity,
): { gap: number; leadSpeed: number } | null {
  const c = entity.traffic_car!;
  const lane = graph.laneById.get(c.laneId);
  if (!lane) return null;
  const px = state.view.px;
  const pz = state.view.pz;

  // Distance from the player to the lane centreline near the car (cheap: use car heading corridor).
  const heading = sampleLane(lane, c.s, scratchB);
  // Vector car→player, decomposed along/across the lane direction.
  const cx = scratchB.x;
  const cz = scratchB.z;
  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const rx = px - cx;
  const rz = pz - cz;
  const along = rx * dirX + rz * dirZ; // ahead (+) / behind (-)
  const across = Math.abs(rx * -dirZ + rz * dirX); // lateral offset
  if (along <= 0.5 || along > PLAYER_IGNORE_AHEAD) return null;
  if (across > lane.width * 0.5 + 1.4) return null;

  const gap = Math.max(0.1, along - c.length * 0.5 - 0.6);
  const pv = state.view.pvx * dirX + state.view.pvz * dirZ; // player speed along the lane
  return { gap, leadSpeed: clamp(pv, 0, 30) };
}
