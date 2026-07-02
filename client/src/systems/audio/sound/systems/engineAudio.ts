// Per-vehicle engine audio. Consumes the shared `vehicle` component (speedKmh / engineOn) and
// derives a normalized RPM that drives a looping engine voice: playbackRate + lowpass open with
// load (a free approximation of layered-RPM crossfade). Publishes `sfx_engineRpm` back to the
// entity for other systems (HUD/VFX). Reconciles voices on entity removal and backend swaps.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { startLoop } from "../dispatch";
import { backendEpoch } from "../runtime";
import type { VoiceHandle } from "../types";

const vehicles = world.with("vehicle", "transform");

interface EngineVoice {
  voice: VoiceHandle | null;
  epoch: number;
}
const live = new Map<ClientEntity, EngineVoice>();

const TOP_SPEED_KMH = 180;
const IDLE = 0.14;

function rpmFromVehicle(e: ClientEntity): number {
  const vc = e.vehicle;
  let speed = vc ? Math.abs(vc.speedKmh) : 0;
  if (!speed && e.velocity) {
    const v = e.velocity.linear;
    speed = Math.hypot(v.x, v.y, v.z) * 3.6;
  }
  return IDLE + Math.min(1, speed / TOP_SPEED_KMH) * (1 - IDLE);
}

export const engineAudioSystem: System<typeof world> = {
  name: "sfx.engine",
  phase: "update",
  order: 11,
  fn: () => {
    const epoch = backendEpoch();
    const seen = new Set<ClientEntity>();

    for (const e of vehicles.entities) {
      const engineOn = e.vehicle?.engineOn ?? true;
      let rec = live.get(e);

      if (e.sfx_muted || !engineOn) {
        if (rec?.voice) {
          rec.voice.stop(120);
          rec.voice = null;
        }
        continue;
      }
      seen.add(e);

      const rpm = rpmFromVehicle(e);
      e.sfx_engineRpm = rpm;
      const pos = e.transform.position;

      if (!rec || rec.epoch !== epoch || !rec.voice || !rec.voice.active) {
        const voice = startLoop("vehicle_engine", { position: pos });
        rec = { voice, epoch };
        live.set(e, rec);
      }

      const voice = rec.voice;
      if (voice) {
        voice.setRate(0.7 + rpm * 1.5);
        voice.setGain(0.4 + rpm * 0.35);
        voice.setLowpass(500 + rpm * 5500);
        voice.setPosition(pos);
      }
    }

    // Stop + drop engines whose vehicle left the world (or turned off above).
    for (const [e, rec] of live) {
      if (!seen.has(e)) {
        rec.voice?.stop(150);
        live.delete(e);
      }
    }
  },
};
