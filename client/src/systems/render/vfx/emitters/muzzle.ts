// Muzzle flash: additive flash core + secondary sparks + a wisp of smoke + a 1-frame light.
import type { VfxEvent } from "../types";
import { MUZZLE } from "../registry";
import type { EmitContext } from "./context";
import { dirScratch, normalizeDir, rgbA, rngFor, unpackHex } from "./context";

export function emitMuzzle(ctx: EmitContext, e: VfxEvent): void {
  const rand = rngFor(e);
  const px = e.position.x;
  const py = e.position.y;
  const pz = e.position.z;
  const scale = e.scale ?? 1;
  const intensity = e.intensity ?? 1;
  const d = e.dir ?? { x: 0, y: 0, z: 1 };
  const dir = normalizeDir(d.x, d.y, d.z, dirScratch);
  const bb = ctx.bb;
  const pt = ctx.pt;

  // Flash core (additive).
  const fc = unpackHex(e.color ?? MUZZLE.flashColor, rgbA);
  bb.x = px + dir.x * 0.1;
  bb.y = py + dir.y * 0.1;
  bb.z = pz + dir.z * 0.1;
  bb.vx = dir.x * 2;
  bb.vy = dir.y * 2;
  bb.vz = dir.z * 2;
  bb.life = 0.05 + 0.03 * rand();
  bb.size0 = MUZZLE.flashSize * scale * 0.7;
  bb.size1 = MUZZLE.flashSize * scale * 1.3;
  bb.r = fc.r;
  bb.g = fc.g;
  bb.b = fc.b;
  bb.alpha = 1.4 * intensity;
  bb.rot = rand() * 6.283;
  bb.rotVel = 0;
  bb.drag = 6;
  bb.gravity = 0;
  bb.fadeIn = 0.15;
  ctx.fire.spawn(bb);

  // Secondary flash puffs (keep fc color).
  for (let i = 0; i < 2; i++) {
    const s = 0.4 + rand() * 0.6;
    bb.x = px;
    bb.y = py;
    bb.z = pz;
    bb.vx = dir.x * 3 * s + (rand() - 0.5) * 2;
    bb.vy = dir.y * 3 * s + (rand() - 0.5) * 2;
    bb.vz = dir.z * 3 * s + (rand() - 0.5) * 2;
    bb.life = 0.04 + 0.04 * rand();
    bb.size0 = 0.2 * scale;
    bb.size1 = 0.5 * scale;
    bb.alpha = 1.0 * intensity;
    bb.rot = rand() * 6.283;
    bb.rotVel = 0;
    bb.drag = 8;
    bb.gravity = 0;
    bb.fadeIn = 0.2;
    ctx.fire.spawn(bb);
  }

  // Sparks along the barrel direction.
  const sc = unpackHex(0xffd27a, rgbA);
  const nSpark = Math.round(6 * intensity);
  for (let i = 0; i < nSpark; i++) {
    const sp = 6 + rand() * 10;
    pt.x = px;
    pt.y = py;
    pt.z = pz;
    pt.vx = dir.x * sp + (rand() - 0.5) * 3;
    pt.vy = dir.y * sp + (rand() - 0.5) * 3;
    pt.vz = dir.z * sp + (rand() - 0.5) * 3;
    pt.life = 0.1 + rand() * 0.15;
    pt.size0 = 0.18 * scale;
    pt.size1 = 0.02;
    pt.r = sc.r;
    pt.g = sc.g;
    pt.b = sc.b;
    pt.alpha = 1.5;
    pt.drag = 3;
    pt.gravity = -6;
    ctx.sparks.spawn(pt);
  }

  // A little smoke.
  const smk = unpackHex(MUZZLE.smokeColor, rgbA);
  bb.x = px + dir.x * 0.2;
  bb.y = py + dir.y * 0.2 + 0.02;
  bb.z = pz + dir.z * 0.2;
  bb.vx = dir.x * 1.2;
  bb.vy = 0.4;
  bb.vz = dir.z * 1.2;
  bb.life = 0.4 + rand() * 0.3;
  bb.size0 = 0.2 * scale;
  bb.size1 = 0.7 * scale;
  bb.r = smk.r;
  bb.g = smk.g;
  bb.b = smk.b;
  bb.alpha = 0.35;
  bb.rot = rand() * 6.283;
  bb.rotVel = rand() - 0.5;
  bb.drag = 2;
  bb.gravity = 0.3;
  bb.fadeIn = 0.25;
  ctx.smoke.spawn(bb);

  ctx.lights.flash(
    px,
    py,
    pz,
    MUZZLE.lightColor,
    MUZZLE.lightIntensity * intensity,
    MUZZLE.lightDistance,
    MUZZLE.lightLife,
  );
  ctx.bloom(MUZZLE.bloom * intensity);
}
