// Speed source with a graceful fallback: prefer the physics-published `veh_state`, otherwise
// derive planar speed from transform deltas. This keeps the HUD/assists honest even before
// vehicle-physics starts writing telemetry (during the parallel wave the car simply reads 0).

import type { ClientEntity } from "@/ecs/clientEntity";
import { KMH_PER_MS } from "./util";

const prev = new Map<number, { x: number; z: number }>();

export interface SpeedReading {
  speedKmh: number; // unsigned
  forwardKmh: number; // signed if physics provides it, else == speedKmh
}

export function readSpeed(e: ClientEntity, dt: number): SpeedReading {
  if (e.veh_state) {
    // Physics publishes signed forward speed in m/s (`forwardSpeed`); HUD/assists want km/h.
    return { speedKmh: e.veh_state.speedKmh, forwardKmh: e.veh_state.forwardSpeed * KMH_PER_MS };
  }
  const t = e.transform?.position;
  if (!t || e.netId === undefined) return { speedKmh: 0, forwardKmh: 0 };
  const p = prev.get(e.netId);
  let speedKmh = 0;
  if (p && dt > 1e-5) {
    speedKmh = (Math.hypot(t.x - p.x, t.z - p.z) / dt) * KMH_PER_MS;
    p.x = t.x;
    p.z = t.z;
  } else {
    prev.set(e.netId, { x: t.x, z: t.z });
  }
  return { speedKmh, forwardKmh: speedKmh };
}

export const forgetSpeed = (netId: number): void => {
  prev.delete(netId);
};

export const clearSpeedCache = (): void => {
  prev.clear();
};
