// UPDATE-phase world weapon pickups. Walk-over an `combat_weaponPickup` entity to be granted the
// weapon + ammo via the inventory acquisition path. Inert (early-returns) until the integrator
// spawns pickups via `spawnWeaponPickup(...)`. Throttled proximity — never per-frame distance math.
// One-shot pickups despawn on collect; `respawn` ones hide and reappear after a delay.

import type { System, Vec3 } from "@sunbreak/shared";
import { queries } from "@/ecs/queries";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { CombatWeaponPickup } from "../types";
import { giveWeapon } from "../integrations/acquisition";
import { sfxWeaponPickup } from "../integrations/audio";
import { WEAPON_PICKUP_RADIUS, WEAPON_PICKUP_RATE, WEAPON_PICKUP_RESPAWN_MS } from "../constants";

type W = typeof world;

const pickups = world.with("combat_weaponPickup", "transform");
const R2 = WEAPON_PICKUP_RADIUS * WEAPON_PICKUP_RADIUS;
let acc = 0;

export interface SpawnPickupOptions {
  /** Reserve ammo granted with the weapon (defaults to the weapon's `startingReserve`). */
  ammo?: number;
  /** Auto-equip the moment it is collected. */
  equip?: boolean;
  /** `true` = respawn after the default delay, a number = custom ms, omitted/false = one-shot. */
  respawn?: boolean | number;
}

/**
 * INTEGRATOR: spawn a collectible weapon pickup at a world position. Returns the ECS entity so you
 * can despawn it yourself if needed. Placement/rendering of the floating mesh is handled by
 * <CombatRig/>.
 */
export function spawnWeaponPickup(
  position: Vec3,
  weaponId: string,
  opts: SpawnPickupOptions = {},
): ClientEntity {
  const respawnMs =
    opts.respawn === true
      ? WEAPON_PICKUP_RESPAWN_MS
      : typeof opts.respawn === "number"
        ? opts.respawn
        : undefined;
  const pk: CombatWeaponPickup = {
    weaponId,
    ammo: opts.ammo,
    equip: opts.equip,
    respawnMs,
    takenAt: 0,
    seed: Math.random() * Math.PI * 2,
  };
  return world.add({
    combat_weaponPickup: pk,
    transform: { position: { ...position }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  });
}

export const weaponPickupSystem: System<W> = {
  name: "combat.weaponPickups",
  phase: "update",
  order: 3,
  fn: (_w, dt) => {
    acc += dt;
    if (acc < WEAPON_PICKUP_RATE) return;
    acc = 0;
    if (pickups.entities.length === 0) return;

    const player = queries.players.entities[0];
    if (!player) return;
    const p = player.transform.position;
    const now = performance.now();

    // Snapshot: collecting a one-shot removes the entity while iterating.
    for (const e of [...pickups.entities]) {
      const pk = e.combat_weaponPickup!;

      // Currently taken → wait for its respawn window.
      if ((pk.takenAt ?? 0) > 0) {
        if (now - (pk.takenAt ?? 0) >= (pk.respawnMs ?? 0)) pk.takenAt = 0;
        continue;
      }

      const q = e.transform.position;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dz = q.z - p.z;
      if (dx * dx + dy * dy + dz * dz > R2) continue;

      // Collect: grant + ammo (inventory adds startingReserve when `ammo` is omitted).
      const granted = giveWeapon(pk.weaponId, { ammo: pk.ammo, equip: pk.equip });
      sfxWeaponPickup({ x: q.x, y: q.y, z: q.z });

      if (!granted || !pk.respawnMs || pk.respawnMs <= 0) {
        world.remove(e);
      } else {
        pk.takenAt = now; // hide + schedule respawn
      }
    }
  },
};
