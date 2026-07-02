// Best-effort bridge to the v0 player body while seated. We do NOT edit client/src/player/**;
// instead we flip the player's Rapier body to Fixed on enter so the on-foot controller's
// kinematic moves become no-ops (the character can't walk off while "driving"), and back to
// kinematic-position on exit. This is a stopgap: the clean fix is a PlayerController early-return
// on `vg_occupant` (see the integrator notes). All calls are guarded + wrapped so a failure here
// never breaks on-foot v0.

import type { ClientEntity } from "@/ecs/clientEntity";
import type { Vec3 } from "@sunbreak/shared";
import { FREEZE_PLAYER_ON_ENTER } from "./config";

// Rapier RigidBodyType numeric values (stable across versions):
// Dynamic=0, Fixed=1, KinematicPositionBased=2, KinematicVelocityBased=3.
const RB_FIXED = 1;
const RB_KINEMATIC_POSITION = 2;

export function freezePlayer(player: ClientEntity): void {
  if (!FREEZE_PLAYER_ON_ENTER) return;
  const body = player.rigidBody;
  if (!body) return;
  try {
    body.setBodyType(RB_FIXED, true);
  } catch {
    /* v0 controller keeps running; occupancy is still tracked. */
  }
}

export function unfreezePlayer(player: ClientEntity, exitWorld?: Vec3): void {
  const body = player.rigidBody;
  if (body) {
    try {
      body.setBodyType(RB_KINEMATIC_POSITION, true);
      if (exitWorld) body.setTranslation(exitWorld, true);
    } catch {
      /* ignore — best effort */
    }
  }
  if (exitWorld && player.transform) {
    player.transform.position.x = exitWorld.x;
    player.transform.position.y = exitWorld.y;
    player.transform.position.z = exitWorld.z;
  }
}
