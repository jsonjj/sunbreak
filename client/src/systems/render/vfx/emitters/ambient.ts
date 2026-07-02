// Ambient + misc effects: single-particle helpers for continuous emitters (dust/exhaust/etc.)
// plus one-shot burst emitters for `smoke`, `dust`, `spark`, and `lightning` event types.
import type { VfxEvent } from "../types";
import type { EmitContext } from "./context";
import { rgbA, rngFor, unpackHex } from "./context";

// ── Continuous single-particle helpers (looped by the system's rate pumps) ──────────────

export function puffDust(ctx: EmitContext, x: number, y: number, z: number, scale: number, hex = 0x9a8f7a): void {
  const c = unpackHex(hex, rgbA);
  const bb = ctx.bb;
  bb.x = x + (Math.random() - 0.5) * 0.2 * scale;
  bb.y = y;
  bb.z = z + (Math.random() - 0.5) * 0.2 * scale;
  bb.vx = (Math.random() - 0.5) * 0.6;
  bb.vy = 0.3 + Math.random() * 0.5;
  bb.vz = (Math.random() - 0.5) * 0.6;
  bb.life = 0.5 + Math.random() * 0.6;
  bb.size0 = 0.3 * scale;
  bb.size1 = 1.0 * scale;
  bb.r = c.r;
  bb.g = c.g;
  bb.b = c.b;
  bb.alpha = 0.28;
  bb.rot = Math.random() * 6.283;
  bb.rotVel = Math.random() - 0.5;
  bb.drag = 2;
  bb.gravity = 0.2;
  bb.fadeIn = 0.3;
  ctx.smoke.spawn(bb);
}

export function puffExhaust(ctx: EmitContext, x: number, y: number, z: number, hex = 0x6d6a66): void {
  const c = unpackHex(hex, rgbA);
  const bb = ctx.bb;
  bb.x = x;
  bb.y = y;
  bb.z = z;
  bb.vx = (Math.random() - 0.5) * 0.4;
  bb.vy = 0.4 + Math.random() * 0.3;
  bb.vz = (Math.random() - 0.5) * 0.4;
  bb.life = 0.6 + Math.random() * 0.5;
  bb.size0 = 0.12;
  bb.size1 = 0.5;
  bb.r = c.r;
  bb.g = c.g;
  bb.b = c.b;
  bb.alpha = 0.25;
  bb.rot = Math.random() * 6.283;
  bb.rotVel = (Math.random() - 0.5) * 0.6;
  bb.drag = 1.5;
  bb.gravity = 0.3;
  bb.fadeIn = 0.3;
  ctx.smoke.spawn(bb);
}

export function puffSmoke(ctx: EmitContext, x: number, y: number, z: number, scale: number, hex = 0x3a3a3d): void {
  const c = unpackHex(hex, rgbA);
  const bb = ctx.bb;
  bb.x = x + (Math.random() - 0.5) * 0.3 * scale;
  bb.y = y;
  bb.z = z + (Math.random() - 0.5) * 0.3 * scale;
  bb.vx = (Math.random() - 0.5) * 0.5;
  bb.vy = 0.8 + Math.random() * 1.0;
  bb.vz = (Math.random() - 0.5) * 0.5;
  bb.life = 1.0 + Math.random() * 1.0;
  bb.size0 = 0.6 * scale;
  bb.size1 = 2.4 * scale;
  bb.r = c.r;
  bb.g = c.g;
  bb.b = c.b;
  bb.alpha = 0.4;
  bb.rot = Math.random() * 6.283;
  bb.rotVel = (Math.random() - 0.5) * 0.8;
  bb.drag = 1;
  bb.gravity = 0.4;
  bb.fadeIn = 0.25;
  ctx.smoke.spawn(bb);
}

export function emberSpark(ctx: EmitContext, x: number, y: number, z: number, scale: number, hex = 0xffa24a): void {
  const c = unpackHex(hex, rgbA);
  const pt = ctx.pt;
  pt.x = x;
  pt.y = y;
  pt.z = z;
  pt.vx = (Math.random() - 0.5) * 2;
  pt.vy = 1 + Math.random() * 3;
  pt.vz = (Math.random() - 0.5) * 2;
  pt.life = 0.4 + Math.random() * 0.6;
  pt.size0 = 0.14 * scale;
  pt.size1 = 0.02;
  pt.r = c.r;
  pt.g = c.g;
  pt.b = c.b;
  pt.alpha = 1.4;
  pt.drag = 1;
  pt.gravity = -8;
  ctx.sparks.spawn(pt);
}

// ── One-shot burst emitters ─────────────────────────────────────────────────────────────

export function emitSmoke(ctx: EmitContext, e: VfxEvent): void {
  const scale = e.scale ?? 1;
  const hex = e.color ?? 0x3a3a3d;
  const n = Math.round((e.count ?? 6) * (0.5 + 0.5 * ctx.quality));
  for (let i = 0; i < n; i++) puffSmoke(ctx, e.position.x, e.position.y, e.position.z, scale, hex);
}

export function emitDust(ctx: EmitContext, e: VfxEvent): void {
  const scale = e.scale ?? 1;
  const hex = e.color ?? 0x9a8f7a;
  const n = Math.round((e.count ?? 6) * (0.5 + 0.5 * ctx.quality));
  for (let i = 0; i < n; i++) puffDust(ctx, e.position.x, e.position.y, e.position.z, scale, hex);
}

export function emitSpark(ctx: EmitContext, e: VfxEvent): void {
  const rand = rngFor(e);
  const scale = e.scale ?? 1;
  const hex = e.color ?? 0xffd27a;
  const c = unpackHex(hex, rgbA);
  const pt = ctx.pt;
  const n = Math.round((e.count ?? 12) * (e.intensity ?? 1));
  for (let i = 0; i < n; i++) {
    const sp = 3 + rand() * 10;
    pt.x = e.position.x;
    pt.y = e.position.y;
    pt.z = e.position.z;
    pt.vx = (rand() - 0.5) * sp;
    pt.vy = (rand() * 0.8 + 0.1) * sp;
    pt.vz = (rand() - 0.5) * sp;
    pt.life = 0.2 + rand() * 0.4;
    pt.size0 = 0.16 * scale;
    pt.size1 = 0.02;
    pt.r = c.r;
    pt.g = c.g;
    pt.b = c.b;
    pt.alpha = 1.6;
    pt.drag = 2;
    pt.gravity = -12;
    ctx.sparks.spawn(pt);
  }
}

export function emitLightning(ctx: EmitContext, e: VfxEvent): void {
  const px = e.position.x;
  const py = e.position.y;
  const pz = e.position.z;
  const intensity = e.intensity ?? 1;
  const c = unpackHex(e.color ?? 0xdff0ff, rgbA);
  const bb = ctx.bb;
  // A brief, huge additive flash.
  bb.x = px;
  bb.y = py;
  bb.z = pz;
  bb.vx = 0;
  bb.vy = 0;
  bb.vz = 0;
  bb.life = 0.14;
  bb.size0 = 6 * (e.scale ?? 1);
  bb.size1 = 10 * (e.scale ?? 1);
  bb.r = c.r;
  bb.g = c.g;
  bb.b = c.b;
  bb.alpha = 2.5 * intensity;
  bb.rot = Math.random() * 6.283;
  bb.rotVel = 0;
  bb.drag = 2;
  bb.gravity = 0;
  bb.fadeIn = 0.02;
  ctx.fire.spawn(bb);
  ctx.lights.flash(px, py, pz, 0xcfe6ff, 24 * intensity, 60, 0.16);
  ctx.bloom(1.2 * intensity);
}
