// The one registered ECS system. Cheap + conflict-free: while a conversation is open,
// gently turn the talking NPC to face the player — but ONLY for view-only entities
// (no rigidBody), so we never fight a physics/animation transform writer. Everything
// else (ambient-AI pause) is driven by the `npc_inConversation` tag other subsystems read.
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { getNpcConfig } from "./config";
import { getActiveConversation } from "./conversation";

type W = typeof world;

const inConversation = world.with("npc_inConversation", "three");
const players = world.with("isPlayer", "transform");

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const npcPersonaSystem: System<W> = {
  name: "npc_personaTick",
  phase: "update",
  order: 0,
  fn: (_world, dt) => {
    const cfg = getNpcConfig();
    if (!cfg.facePlayer) return;
    if (!getActiveConversation()) return;

    const target = players.entities[0]?.transform.position;
    if (!target) return;

    for (const entity of inConversation) {
      // Skip physics-driven bodies — their transform is owned elsewhere.
      if (entity.rigidBody) continue;
      const obj = entity.three;
      const dx = target.x - obj.position.x;
      const dz = target.z - obj.position.z;
      if (dx * dx + dz * dz < 1e-4) continue;
      const desired = Math.atan2(dx, dz);
      obj.rotation.y = lerpAngle(obj.rotation.y, desired, Math.min(1, dt * 6));
    }
  },
};
