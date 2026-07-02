// Explosion: layered flash + fireball core + rising smoke + embers/debris + scorch decal +
// a big dynamic light + bloom pulse + camera-shake impulse + a three.quarks batched hero plume.
import type { VfxEvent } from "../types";
import { EXPLOSION } from "../registry";
import { shake } from "../core/shake";
import type { EmitContext } from "./context";
import { rgbA, rgbB, rngFor, unpackHex } from "./context";

export function emitExplosion(ctx: EmitContext, e: VfxEvent): void {
  const rand = rngFor(e);
  const px = e.position.x;
  const py = e.position.y;
  const pz = e.position.z;
  const scale = e.scale ?? 1;
  const intensity = e.intensity ?? 1;
  const bb = ctx.bb;
  const pt = ctx.pt;

  // Bright flash.
  let c = unpackHex(EXPLOSION.flashColor, rgbA);
  bb.x = px;
  bb.y = py;
  bb.z = pz;
  bb.vx = 0;
  bb.vy = 0;
  bb.vz = 0;
  bb.life = 0.12;
  bb.size0 = 1.5 * scale;
  bb.size1 = 5 * scale;
  bb.r = c.r;
  bb.g = c.g;
  bb.b = c.b;
  bb.alpha = 2.2 * intensity;
  bb.rot = rand() * 6.283;
  bb.rotVel = 0;
  bb.drag = 4;
  bb.gravity = 0;
  bb.fadeIn = 0.05;
  ctx.fire.spawn(bb);

  // Fireball core.
  c = unpackHex(EXPLOSION.coreColor, rgbA);
  const nCore = Math.round(10 * intensity * (0.6 + 0.4 * ctx.quality));
  for (let i = 0; i < nCore; i++) {
    const sp = 2 + rand() * 6;
    bb.x = px + (rand() - 0.5) * 0.6 * scale;
    bb.y = py + (rand() - 0.5) * 0.6 * scale;
    bb.z = pz + (rand() - 0.5) * 0.6 * scale;
    bb.vx = (rand() - 0.5) * sp;
    bb.vy = (rand() * 0.8 + 0.1) * sp;
    bb.vz = (rand() - 0.5) * sp;
    bb.life = 0.3 + rand() * 0.4;
    bb.size0 = 1.2 * scale;
    bb.size1 = 2.6 * scale;
    bb.r = c.r;
    bb.g = c.g;
    bb.b = c.b;
    bb.alpha = 1.6 * intensity;
    bb.rot = rand() * 6.283;
    bb.rotVel = rand() - 0.5;
    bb.drag = 3;
    bb.gravity = 1;
    bb.fadeIn = 0.1;
    ctx.fire.spawn(bb);
  }

  // Rising smoke.
  c = unpackHex(EXPLOSION.smokeColor, rgbB);
  const nSmoke = Math.round(8 * (0.5 + 0.5 * ctx.quality));
  for (let i = 0; i < nSmoke; i++) {
    bb.x = px + (rand() - 0.5) * 1.0 * scale;
    bb.y = py + rand() * 0.5;
    bb.z = pz + (rand() - 0.5) * 1.0 * scale;
    bb.vx = (rand() - 0.5) * 2;
    bb.vy = 1.5 + rand() * 2.5;
    bb.vz = (rand() - 0.5) * 2;
    bb.life = 1.0 + rand() * 1.2;
    bb.size0 = 1.5 * scale;
    bb.size1 = 4.5 * scale;
    bb.r = c.r;
    bb.g = c.g;
    bb.b = c.b;
    bb.alpha = 0.7;
    bb.rot = rand() * 6.283;
    bb.rotVel = (rand() - 0.5) * 1.2;
    bb.drag = 1.2;
    bb.gravity = 0.6;
    bb.fadeIn = 0.2;
    ctx.smoke.spawn(bb);
  }

  // Embers + debris.
  c = unpackHex(EXPLOSION.emberColor, rgbA);
  const nEmber = Math.round(24 * intensity * (0.5 + 0.5 * ctx.quality));
  for (let i = 0; i < nEmber; i++) {
    const dx = rand() - 0.5;
    const dy = rand() * 0.9 + 0.1;
    const dz = rand() - 0.5;
    const l = Math.hypot(dx, dy, dz) || 1;
    const sp = 5 + rand() * 14;
    pt.x = px;
    pt.y = py;
    pt.z = pz;
    pt.vx = (dx / l) * sp;
    pt.vy = (dy / l) * sp;
    pt.vz = (dz / l) * sp;
    pt.life = 0.5 + rand() * 0.9;
    pt.size0 = 0.22 * scale;
    pt.size1 = 0.02;
    pt.r = c.r;
    pt.g = c.g;
    pt.b = c.b;
    pt.alpha = 1.8;
    pt.drag = 1;
    pt.gravity = -14;
    ctx.sparks.spawn(pt);
  }

  // Scorch decal.
  const dcl = unpackHex(0x0d0d0f, rgbA);
  ctx.decals.add(px, py + 0.02, pz, rand() * 6.283, 2.4 * scale, 2.4 * scale, 0.75, 30, dcl.r, dcl.g, dcl.b);

  ctx.lights.flash(
    px,
    py,
    pz,
    EXPLOSION.lightColor,
    EXPLOSION.lightIntensity * intensity,
    EXPLOSION.lightDistance * scale,
    EXPLOSION.lightLife,
  );
  ctx.bloom(EXPLOSION.bloom * intensity);
  shake.impulse(Math.min(1.2, 0.6 * intensity), 0.5);
  ctx.hero.spawn(px, py, pz, scale, intensity);
}
