// Surface-driven impacts: spark spray + debris + puff/splash/blood mist + optional decal.
import type { VfxEvent } from "../types";
import { impactFor } from "../registry";
import type { EmitContext } from "./context";
import { dirScratch, normalizeDir, rgbA, rgbB, rngFor, unpackHex } from "./context";

export function emitImpact(ctx: EmitContext, e: VfxEvent): void {
  const rand = rngFor(e);
  const px = e.position.x;
  const py = e.position.y;
  const pz = e.position.z;
  const scale = e.scale ?? 1;
  const intensity = e.intensity ?? 1;
  const preset = impactFor(e.surface);
  const n = e.normal ?? { x: 0, y: 1, z: 0 };
  const nrm = normalizeDir(n.x, n.y, n.z, dirScratch);
  const bb = ctx.bb;
  const pt = ctx.pt;

  // Hot sparks (metal/glass/concrete).
  if (preset.sparks > 0) {
    const sc = unpackHex(preset.sparkColor, rgbA);
    const ns = Math.round(preset.sparks * intensity * (0.6 + 0.4 * ctx.quality));
    for (let i = 0; i < ns; i++) {
      const sp = 4 + rand() * 9;
      pt.x = px;
      pt.y = py;
      pt.z = pz;
      pt.vx = (nrm.x + (rand() - 0.5) * 1.4) * sp;
      pt.vy = (nrm.y + (rand() - 0.5) * 1.4) * sp + 2;
      pt.vz = (nrm.z + (rand() - 0.5) * 1.4) * sp;
      pt.life = 0.15 + rand() * 0.3;
      pt.size0 = 0.16 * scale;
      pt.size1 = 0.02;
      pt.r = sc.r;
      pt.g = sc.g;
      pt.b = sc.b;
      pt.alpha = 1.6;
      pt.drag = 2;
      pt.gravity = -12;
      ctx.sparks.spawn(pt);
    }
  }

  // Debris chunks (dimmer, heavier).
  if (preset.debris > 0) {
    const dc = unpackHex(preset.blood ? preset.puffColor : 0x8a8078, rgbA);
    const nd = Math.round(preset.debris * (0.5 + 0.5 * ctx.quality));
    for (let i = 0; i < nd; i++) {
      const sp = 2 + rand() * 6;
      pt.x = px;
      pt.y = py;
      pt.z = pz;
      pt.vx = (nrm.x + (rand() - 0.5) * 1.8) * sp;
      pt.vy = (nrm.y + rand() * 1.2) * sp + 3;
      pt.vz = (nrm.z + (rand() - 0.5) * 1.8) * sp;
      pt.life = 0.3 + rand() * 0.5;
      pt.size0 = 0.1 * scale;
      pt.size1 = 0.06 * scale;
      pt.r = dc.r;
      pt.g = dc.g;
      pt.b = dc.b;
      pt.alpha = 1.0;
      pt.drag = 1;
      pt.gravity = -14;
      ctx.sparks.spawn(pt);
    }
  }

  // Puff / splash / blood mist.
  const pc = unpackHex(preset.puffColor, rgbB);
  const np = Math.round(preset.puffs * (0.6 + 0.4 * ctx.quality));
  for (let i = 0; i < np; i++) {
    bb.x = px + (rand() - 0.5) * 0.2;
    bb.y = py + (rand() - 0.5) * 0.2;
    bb.z = pz + (rand() - 0.5) * 0.2;
    if (preset.splash) {
      bb.vx = (rand() - 0.5) * 2;
      bb.vy = 3 + rand() * 3;
      bb.vz = (rand() - 0.5) * 2;
      bb.gravity = -6;
    } else {
      bb.vx = nrm.x * 1.5 + (rand() - 0.5);
      bb.vy = nrm.y * 1.2 + 0.4 + rand() * 0.6;
      bb.vz = nrm.z * 1.5 + (rand() - 0.5);
      bb.gravity = 0.4;
    }
    bb.life = 0.35 + rand() * 0.4;
    bb.size0 = preset.puffSize * scale * 0.6;
    bb.size1 = preset.puffSize * scale * 1.8;
    bb.r = pc.r;
    bb.g = pc.g;
    bb.b = pc.b;
    bb.alpha = preset.blood ? 0.8 : 0.5;
    bb.rot = rand() * 6.283;
    bb.rotVel = (rand() - 0.5) * 2;
    bb.drag = 2.5;
    bb.fadeIn = 0.2;
    ctx.smoke.spawn(bb);
  }

  // Decal on roughly horizontal surfaces.
  if (preset.decal && nrm.y > 0.4) {
    const dcl = unpackHex(preset.decalColor, rgbA);
    const sz = 0.4 * scale + rand() * 0.2;
    ctx.decals.add(
      px,
      py + 0.01,
      pz,
      rand() * 6.283,
      sz,
      sz,
      preset.blood ? 0.7 : 0.5,
      preset.blood ? 18 : 40,
      dcl.r,
      dcl.g,
      dcl.b,
    );
  }

  if (preset.sparks >= 10) ctx.bloom(0.06 * intensity);
}
