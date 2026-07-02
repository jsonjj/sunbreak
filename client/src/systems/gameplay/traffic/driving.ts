// Core driving: advance signal phases, then run IDM car-following for every ambient car. Perception
// blends the nearest lead (occupancy), the stop line (signal phase + junction-box right-of-way), and
// the player-as-obstacle. Integration is kinematic (speed + arc-length s), with a lateral offset for
// pull-overs, a deadlock watchdog, and wreck-TTL recycling.
import type { ClientEntity } from "@/ecs/clientEntity";
import { CAR_Y, JUNCTION_BOX, STOP_LINE_SETBACK, STUCK_LIMIT, WRECK_TTL } from "./config";
import { trafficEvents } from "./events";
import { idmAccel } from "./idm";
import { getLightPhaseForLane, sampleLane } from "./laneGraph";
import { recycleCar } from "./lifecycle";
import { scratchA, setYawQuat } from "./math";
import { leadGap } from "./occupancy";
import { playerObstacle } from "./reactions";
import { advanceLane } from "./route";
import { offscreen, state } from "./state";
import type { Intersection, LaneGraph } from "./types";

const deadEnds: ClientEntity[] = [];
let lastHonkAt = 0;

function groupIndexOf(inter: Intersection, laneId: number): number {
  for (let i = 0; i < inter.groups.length; i++) {
    if (inter.groups[i]!.indexOf(laneId) >= 0) return i;
  }
  return -1;
}

/** Cycle every signalized intersection (green → yellow → next group) and reset its box flags. */
export function updateIntersections(graph: LaneGraph, dt: number): void {
  for (const inter of graph.intersections) {
    inter.timer -= dt;
    if (inter.timer <= 0) {
      if (!inter.yellow) {
        inter.yellow = true;
        inter.timer = inter.yellowDuration;
      } else {
        inter.yellow = false;
        inter.phase = (inter.phase + 1) % inter.groups.length;
        inter.timer = inter.greenDuration;
      }
    }
    inter.boxBusy = false;
    inter.boxGroup = -1;
  }
}

interface Perception {
  gap: number;
  leadSpeed: number;
  playerForced: boolean;
}

function perceive(graph: LaneGraph, e: ClientEntity): Perception {
  const c = e.traffic_car!;
  let gap = Infinity;
  let leadSpeed = c.desiredSpeed;
  let playerForced = false;

  const lead = leadGap(graph, e);
  if (lead && lead.gap < gap) {
    gap = lead.gap;
    leadSpeed = lead.leadSpeed;
  }

  const lane = graph.laneById.get(c.laneId);
  if (lane && lane.intersectionId >= 0) {
    const distEnd = lane.length - c.s - STOP_LINE_SETBACK;
    const inter = graph.intersectionById.get(lane.intersectionId);
    if (inter && distEnd > -2) {
      const myGroup = groupIndexOf(inter, lane.id);
      if (!c.ignoreSignals && getLightPhaseForLane(graph, lane.id) !== "green") {
        const g = Math.max(0.1, distEnd);
        if (g < gap) {
          gap = g;
          leadSpeed = 0;
        }
      }
      if (inter.boxBusy && inter.boxGroup !== myGroup && distEnd < JUNCTION_BOX) {
        const g = Math.max(0.1, distEnd);
        if (g < gap) {
          gap = g;
          leadSpeed = 0;
        }
      }
    }
  }

  const p = playerObstacle(graph, e);
  if (p && p.gap < gap) {
    gap = p.gap;
    leadSpeed = p.leadSpeed;
    playerForced = true;
  }
  return { gap, leadSpeed, playerForced };
}

export function driveCars(graph: LaneGraph, cars: readonly ClientEntity[], dt: number): void {
  deadEnds.length = 0;

  // Pass A — mark junction-box occupancy for right-of-way.
  for (const e of cars) {
    const c = e.traffic_car!;
    if (c.dynamic) continue;
    const lane = graph.laneById.get(c.laneId);
    if (!lane || lane.intersectionId < 0) continue;
    if (lane.length - c.s < JUNCTION_BOX) {
      const inter = graph.intersectionById.get(lane.intersectionId);
      if (inter) {
        inter.boxBusy = true;
        inter.boxGroup = groupIndexOf(inter, lane.id);
      }
    }
  }

  // Pass B — drive.
  for (const e of cars) {
    const c = e.traffic_car!;
    const t = e.transform!;

    // Wrecks are owned by physics; just age + recycle them.
    if (c.dynamic) {
      c.wreckT += dt;
      if (c.wreckT > WRECK_TTL && offscreen(t.position.x, t.position.z)) deadEnds.push(e);
      continue;
    }

    // v0 for IDM tracks the (reaction-scaled) desired speed. Tiny value ⇒ hard brake to a stop.
    c.driver.v0 = Math.max(0.05, c.desiredSpeed);
    const per = perceive(graph, e);
    const a = idmAccel(c.speed, per.gap, c.speed - per.leadSpeed, c.driver);
    const prevSpeed = c.speed;
    c.speed = Math.max(0, c.speed + a * dt);
    const vmax = c.desiredSpeed * 1.15 + 0.2;
    if (c.speed > vmax) c.speed = vmax;
    c.s += c.speed * dt;

    // Honk when the player forces a hard stop (throttled globally).
    if (per.playerForced && prevSpeed > 3 && c.speed < 1) {
      const now = performance.now();
      if (now - lastHonkAt > 600) {
        lastHonkAt = now;
        trafficEvents.emit("honk", { x: t.position.x, z: t.position.z });
      }
    }

    // Cross lane boundaries.
    let lane = graph.laneById.get(c.laneId)!;
    if (c.s >= lane.length) {
      if (!advanceLane(graph, c, state.rng)) {
        deadEnds.push(e);
        continue;
      }
      lane = graph.laneById.get(c.laneId)!;
    }

    // Lateral easing (pull-over) + write transform from the lane sample.
    c.lateral += (c.targetLateral - c.lateral) * Math.min(1, dt * 3);
    const heading = sampleLane(lane, c.s, scratchA);
    c.headingY = heading;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = fz; // right of a +Z-forward heading
    const rz = -fx;
    t.position.x = scratchA.x + rx * c.lateral;
    t.position.y = CAR_Y;
    t.position.z = scratchA.z + rz * c.lateral;
    setYawQuat(t.rotation, heading);
    const vlin = e.velocity!.linear;
    vlin.x = fx * c.speed;
    vlin.y = 0;
    vlin.z = fz * c.speed;

    // Deadlock watchdog.
    if (c.speed < 0.25) c.stuckT += dt;
    else c.stuckT = 0;
    if (c.stuckT > STUCK_LIMIT) {
      if (offscreen(t.position.x, t.position.z)) {
        deadEnds.push(e);
        continue;
      }
      c.stuckT = 0;
      c.speed = 1.6; // creep to break a gridlock
    }
  }

  for (const e of deadEnds) recycleCar(e);
  deadEnds.length = 0;
}
