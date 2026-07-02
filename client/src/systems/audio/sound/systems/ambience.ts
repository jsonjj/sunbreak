// City ambience. Maintains the looping city ambience BED (+ a wind bed) and fires scattered
// one-shots (distant horns, dogs, sirens, gulls, planes, gunshots) on jittered timers at random
// azimuths around the listener. Scatter rate scales with ped density from the ECS, so a busier
// street sounds busier. Rebuilds the beds if the audio backend is swapped.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { playEvent, startLoop } from "../dispatch";
import { backendEpoch } from "../runtime";
import type { VoiceHandle } from "../types";
import type { SoundEventId } from "../catalog";
import type { Vec3 } from "@sunbreak/shared";

const players = world.with("isPlayer", "transform");
const peds = world.with("isPed");

const TAU = Math.PI * 2;

const SCATTER: readonly SoundEventId[] = [
  "scatter_distant_horn",
  "scatter_dog_bark",
  "scatter_distant_siren",
  "scatter_seagull",
  "scatter_plane",
  "scatter_distant_gunshot",
];

interface AmbienceState {
  bed: VoiceHandle | null;
  wind: VoiceHandle | null;
  epoch: number;
  scatterClock: number;
  nextScatter: number;
}
const s: AmbienceState = {
  bed: null,
  wind: null,
  epoch: -1,
  scatterClock: 0,
  nextScatter: 4 + Math.random() * 5,
};

function ensureBeds(): void {
  const epoch = backendEpoch();
  const bedDead = !s.bed || !s.bed.active;
  const windDead = !s.wind || !s.wind.active;
  if (s.epoch === epoch && !bedDead && !windDead) return;
  if (bedDead || s.epoch !== epoch) s.bed = startLoop("ambience_city");
  if (windDead || s.epoch !== epoch) s.wind = startLoop("ambience_wind");
  s.epoch = epoch;
}

function scatterAround(pos: Vec3 | undefined): Vec3 | undefined {
  if (!pos) return undefined;
  const a = Math.random() * TAU;
  const r = 20 + Math.random() * 45;
  return { x: pos.x + Math.cos(a) * r, y: pos.y + (Math.random() * 6 - 2), z: pos.z + Math.sin(a) * r };
}

export const ambienceSystem: System<typeof world> = {
  name: "sfx.ambience",
  phase: "update",
  order: 14,
  fn: (_w, dt) => {
    ensureBeds();

    s.scatterClock += Math.min(dt, 0.25);
    if (s.scatterClock < s.nextScatter) return;
    s.scatterClock = 0;

    // Denser crowds => shorter gaps between scattered events.
    const density = peds.entities.length;
    const base = Math.max(3, 9 - density * 0.4);
    s.nextScatter = base * (0.6 + Math.random() * 0.8);

    const id = SCATTER[(Math.random() * SCATTER.length) | 0];
    if (!id) return;
    const pos = scatterAround(players.entities[0]?.transform?.position);
    playEvent(id, { position: pos });
  },
};
