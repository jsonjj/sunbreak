// finish-phase sim -> UI bridge: watches the player's health/`isDead` tag and emits
// `player:death` / `player:revive` on the bus exactly once per transition (deduped with the
// `ux_deathAckd` ECS tag). The event->store mapping (screen + cinematic) lives in wireEvents,
// keeping this system a pure sim reader. Runs in `finish` per the phase contract ("mirror
// selected sim values into Zustand for the HUD").
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import { gameEvents } from "../state/bus";

type W = typeof world;

// Persistent archetype query (miniplex caches it) — the player entity once it has health.
const players = world.with("isPlayer", "health");

export function deathWatch(_w: W, _dt: number): void {
  for (const e of players) {
    const entity = e as ClientEntity;
    const dead = entity.isDead === true || (entity.health?.current ?? 1) <= 0;
    if (dead && !entity.ux_deathAckd) {
      world.addComponent(entity, "ux_deathAckd", true);
      gameEvents.emit("player:death", { cause: "You flatlined on the strip." });
    } else if (!dead && entity.ux_deathAckd) {
      world.removeComponent(entity, "ux_deathAckd");
      gameEvents.emit("player:revive");
    }
  }
}
