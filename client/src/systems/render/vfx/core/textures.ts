// Procedurally generated sprite atlas — zero asset cost, guaranteed available offline (the
// CC0 flipbook/atlas path from vfx.md can drop in later behind the same texture handles).
// Every texture is a soft, premultiply-friendly alpha sprite meant for additive OR alpha
// blending. Generated once, lazily, and cached.
import * as THREE from "three";

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  return ctx ? { c, ctx } : null;
}

function finalize(c: HTMLCanvasElement, srgb = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.premultiplyAlpha = false;
  return tex;
}

/** Soft radial falloff — the workhorse sprite for glows, flashes, fire cores, embers. */
function makeGlow(size = 128): THREE.CanvasTexture {
  const cc = canvas(size);
  if (!cc) return finalize(document.createElement("canvas"));
  const { c, ctx } = cc;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.35)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finalize(c);
}

/** Lumpy soft puff for smoke / dust / exhaust — layered blobs of noise-ish alpha. */
function makeSmoke(size = 128): THREE.CanvasTexture {
  const cc = canvas(size);
  if (!cc) return finalize(document.createElement("canvas"));
  const { c, ctx } = cc;
  const r = size / 2;
  // Base soft disc.
  const base = ctx.createRadialGradient(r, r, 0, r, r, r);
  base.addColorStop(0.0, "rgba(255,255,255,0.9)");
  base.addColorStop(0.6, "rgba(255,255,255,0.4)");
  base.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Break up the edge with a handful of offset blobs.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const dist = r * (0.28 + 0.22 * Math.sin(i * 2.3));
    const bx = r + Math.cos(a) * dist;
    const by = r + Math.sin(a) * dist;
    const br = r * (0.28 + 0.14 * Math.cos(i * 1.7));
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, "rgba(255,255,255,0.5)");
    bg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  return finalize(c);
}

/** Small hot spark point — bright center, tight falloff (for Points sprites). */
function makeSpark(size = 64): THREE.CanvasTexture {
  const cc = canvas(size);
  if (!cc) return finalize(document.createElement("canvas"));
  const { c, ctx } = cc;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finalize(c);
}

/** Vertical rain streak — a soft-edged bright bar fading top→bottom. */
function makeStreak(w = 16, h = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return finalize(c);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.8)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  // Soft horizontal falloff too.
  const hg = ctx.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0, "rgba(0,0,0,0)");
  hg.addColorStop(0.5, "rgba(0,0,0,1)");
  hg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);
  return finalize(c);
}

/** Elongated soft smear for skid / scorch ground decals. */
function makeSmear(size = 128): THREE.CanvasTexture {
  const cc = canvas(size);
  if (!cc) return finalize(document.createElement("canvas"));
  const { c, ctx } = cc;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.7, "rgba(255,255,255,0.5)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finalize(c);
}

export interface VfxTextures {
  glow: THREE.CanvasTexture;
  smoke: THREE.CanvasTexture;
  spark: THREE.CanvasTexture;
  streak: THREE.CanvasTexture;
  smear: THREE.CanvasTexture;
}

let cache: VfxTextures | null = null;

/** Lazily build + cache the procedural sprite set (safe to call every frame). */
export function getTextures(): VfxTextures {
  if (!cache) {
    cache = {
      glow: makeGlow(),
      smoke: makeSmoke(),
      spark: makeSpark(),
      streak: makeStreak(),
      smear: makeSmear(),
    };
  }
  return cache;
}

export function disposeTextures(): void {
  if (!cache) return;
  cache.glow.dispose();
  cache.smoke.dispose();
  cache.spark.dispose();
  cache.streak.dispose();
  cache.smear.dispose();
  cache = null;
}
