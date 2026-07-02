// Render-phase system: drive the Howler listener from an ECS entity — the entity tagged
// `audio_listener`, or (fallback) the local player. This is the "listener follows the
// camera/player via ECS" path and needs no hand-mounted R3F component. If the optional
// <AudioListenerRig/> is mounted, this system stands down.
import type { System } from "@sunbreak/shared";
import type { Quat } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { isCameraListenerActive, setListener } from "../spatial/listener";

type W = typeof world;

const listenerEntities = world.with("audio_listener", "transform");
const players = world.with("isPlayer", "transform");

/** Approximate ear height above the entity origin (meters). */
const HEAD_OFFSET = 1.5;
/** Throttle listener updates to ~60 Hz (cheap, but avoids extra work on 120 Hz displays). */
const UPDATE_RATE = 1 / 60;
let acc = 0;

const fwd: [number, number, number] = [0, 0, -1];

function forwardFromFacing(facing: number): void {
  fwd[0] = -Math.sin(facing);
  fwd[1] = 0;
  fwd[2] = -Math.cos(facing);
}

/** Rotate the -Z axis by a quaternion to get the world forward vector. */
function forwardFromQuat(q: Quat): void {
  const { x, y, z, w } = q;
  fwd[0] = -2 * (w * y + x * z);
  fwd[1] = 2 * (w * x - y * z);
  fwd[2] = -1 + 2 * (x * x + y * y);
}

export const listenerSystem: System<W> = {
  name: "audioListener",
  phase: "render",
  order: 0,
  fn: (_world, dt) => {
    if (isCameraListenerActive()) return;
    acc += dt;
    if (acc < UPDATE_RATE) return;
    acc = 0;

    const entity = listenerEntities.first ?? players.first;
    const t = entity?.transform;
    if (!t) return;

    const facing = entity?.movement?.facing;
    if (typeof facing === "number") forwardFromFacing(facing);
    else forwardFromQuat(t.rotation);

    setListener(t.position.x, t.position.y + HEAD_OFFSET, t.position.z, fwd[0], fwd[1], fwd[2], 0, 1, 0);
  },
};
