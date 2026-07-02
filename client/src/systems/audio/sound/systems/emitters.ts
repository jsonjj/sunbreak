// Declarative looping-emitter manager. Any entity with an `sfx_emitter` component gets a looped
// positional voice that tracks its transform — a zero-code way for other subsystems to attach
// ambient point sources, machinery hums, sirens, etc. via the ECS. Honors `enabled` and
// `sfx_muted`, and reconciles on entity removal / backend swap.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { startLoop } from "../dispatch";
import { backendEpoch } from "../runtime";
import type { VoiceHandle } from "../types";
import type { SoundEventId } from "../catalog";

const emitters = world.with("sfx_emitter", "transform");

interface EmitterVoice {
  voice: VoiceHandle | null;
  epoch: number;
  event: SoundEventId;
}
const live = new Map<ClientEntity, EmitterVoice>();

export const emitterSystem: System<typeof world> = {
  name: "sfx.emitters",
  phase: "update",
  order: 13,
  fn: () => {
    const epoch = backendEpoch();
    const seen = new Set<ClientEntity>();

    for (const e of emitters.entities) {
      const spec = e.sfx_emitter;
      if (!spec) continue;
      seen.add(e);
      const enabled = spec.enabled !== false && !e.sfx_muted;
      let rec = live.get(e);

      if (!enabled) {
        if (rec?.voice) {
          rec.voice.stop(120);
          rec.voice = null;
        }
        continue;
      }

      if (
        !rec ||
        rec.epoch !== epoch ||
        rec.event !== spec.event ||
        !rec.voice ||
        !rec.voice.active
      ) {
        rec?.voice?.stop(80);
        const voice = startLoop(spec.event, { position: e.transform.position, gain: spec.gain });
        rec = { voice, epoch, event: spec.event };
        live.set(e, rec);
      }

      if (rec.voice) {
        rec.voice.setPosition(e.transform.position);
        if (spec.gain != null) rec.voice.setGain(spec.gain);
      }
    }

    for (const [e, rec] of live) {
      if (!seen.has(e)) {
        rec.voice?.stop(150);
        live.delete(e);
      }
    }
  },
};
