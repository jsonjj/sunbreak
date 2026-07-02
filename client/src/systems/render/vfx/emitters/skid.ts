// Skid / tire marks: a dark ground-decal segment oriented along travel + optional tire smoke.
// Called one-shot per event, or repeatedly by the continuous `vfx_skid` component pump.
import type { VfxEvent } from "../types";
import type { EmitContext } from "./context";
import { rngFor } from "./context";

export function emitSkid(ctx: EmitContext, e: VfxEvent): void {
  const rand = rngFor(e);
  const px = e.position.x;
  const py = e.position.y;
  const pz = e.position.z;
  const scale = e.scale ?? 1;
  const intensity = e.intensity ?? 0.6;
  const d = e.dir ?? { x: 0, y: 0, z: 1 };
  const yaw = Math.atan2(d.x, d.z);
  const width = 0.22 * scale;
  const len = 0.6 * scale;
  ctx.decals.add(px, py + 0.01, pz, yaw, len, width, intensity, 14, 0.04, 0.04, 0.05);

  if (intensity > 0.7 && rand() < 0.5) {
    const bb = ctx.bb;
    bb.x = px;
    bb.y = py + 0.1;
    bb.z = pz;
    bb.vx = rand() - 0.5;
    bb.vy = 0.5 + rand();
    bb.vz = rand() - 0.5;
    bb.life = 0.5 + rand() * 0.5;
    bb.size0 = 0.3 * scale;
    bb.size1 = 1.2 * scale;
    bb.r = 0.4;
    bb.g = 0.4;
    bb.b = 0.42;
    bb.alpha = 0.3;
    bb.rot = rand() * 6.283;
    bb.rotVel = rand() - 0.5;
    bb.drag = 1.5;
    bb.gravity = 0.3;
    bb.fadeIn = 0.25;
    ctx.smoke.spawn(bb);
  }
}
