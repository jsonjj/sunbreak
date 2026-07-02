// Procedural textures — everything is generated at runtime (Canvas2D / DataTexture) so the
// subsystem ships with ZERO binary assets and no network fetches. All CC0 by construction.
// (KTX2/glTF asset pipeline from the spec is a v4 upgrade; noted in the report.)

import * as THREE from "three";
import { BUILT_HALF } from "./constants";
import { fbm } from "./noise";
import { buildHeightfield, sampleHeight } from "./heightfield";

function makeCanvas(size: number): { cvs: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext("2d");
  if (!ctx) throw new Error("env: 2D canvas context unavailable");
  return { cvs, ctx };
}

function tuneRepeat(t: THREE.Texture, repeat: number): THREE.Texture {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Subtle near-white grain so baked vertex colours stay dominant but the ground isn't flat. */
export function makeDetailAlbedo(size = 256): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.09, y * 0.09, 5501, 4) * 0.5 + 0.5;
      const g = fbm(x * 0.5, y * 0.5, 5507, 2) * 0.5 + 0.5;
      const v = 175 + n * 55 + g * 25;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.SRGBColorSpace;
  return tuneRepeat(t, 1);
}

/** Procedural tangent-space normal map derived from a noise heightfield (micro surface relief). */
export function makeDetailNormal(size = 256, strength = 1.4): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => fbm(x * 0.12, y * 0.12, 6203, 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = h(x - 1, y);
      const hr = h(x + 1, y);
      const hd = h(x, y - 1);
      const hu = h(x, y + 1);
      const nx = (hl - hr) * strength;
      const ny = (hd - hu) * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.NoColorSpace;
  return tuneRepeat(t, 1);
}

/** Grayscale roughness variation. */
export function makeRoughness(size = 256): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.15, y * 0.15, 6607, 3) * 0.5 + 0.5;
      const v = 150 + n * 95;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.NoColorSpace;
  return tuneRepeat(t, 1);
}

/** Alpha-tested grass/sawgrass blade card texture (soft tapered blades, transparent gaps). */
export function makeBladeTexture(size = 128, tint = "#6f8a3a"): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const cx = (b + 0.5) * (size / blades) + (Math.sin(b * 12.9) * size) / blades / 3;
    const w = size / blades / 2.4;
    const grad = ctx.createLinearGradient(0, size, 0, 0);
    grad.addColorStop(0, "#3d5222");
    grad.addColorStop(1, tint);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, size);
    ctx.quadraticCurveTo(cx - w * 0.2, size * 0.4, cx + (b % 2 ? 3 : -3), 4);
    ctx.quadraticCurveTo(cx + w * 0.2, size * 0.4, cx + w * 0.5, size);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Bark-ish texture for trunks. */
export function makeBarkTexture(size = 128): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const streak = fbm(x * 0.4, y * 0.05, 7001, 3) * 0.5 + 0.5;
      const r = 70 + streak * 40;
      const g = 52 + streak * 30;
      const b = 38 + streak * 22;
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.SRGBColorSpace;
  return tuneRepeat(t, 1);
}

/** Two-scale water ripple normal map (tiled). */
export function makeWaterNormal(size = 256): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) =>
    fbm(x * 0.06, y * 0.06, 7333, 4) * 0.7 + fbm(x * 0.2, y * 0.2, 7349, 3) * 0.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (h(x - 1, y) - h(x + 1, y)) * 2;
      const ny = (h(x, y - 1) - h(x, y + 1)) * 2;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.NoColorSpace;
  return tuneRepeat(t, 1);
}

/** Soft animated-noise texture used for shoreline foam. */
export function makeFoamTexture(size = 256): THREE.Texture {
  const { cvs, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.pow(fbm(x * 0.12, y * 0.12, 7411, 4) * 0.5 + 0.5, 1.6);
      const v = n * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.NoColorSpace;
  return tuneRepeat(t, 1);
}

export interface HeightTextureResult {
  texture: THREE.DataTexture;
  min: number;
  range: number;
  worldMin: number;
  worldSize: number;
}

/**
 * Encode terrain height across the built extent into a DataTexture (R channel, normalised),
 * so the water shaders can compute depth → shore blend + foam without a scene depth pass.
 */
export function makeHeightTexture(size = 256): HeightTextureResult {
  const hf = buildHeightfield();
  const min = hf.min;
  const range = Math.max(0.001, hf.max - hf.min);
  const worldMin = -BUILT_HALF;
  const worldSize = BUILT_HALF * 2;
  const data = new Uint8Array(size * size * 4);
  for (let iy = 0; iy < size; iy++) {
    for (let ix = 0; ix < size; ix++) {
      const wx = worldMin + (ix / (size - 1)) * worldSize;
      const wz = worldMin + (iy / (size - 1)) * worldSize;
      const h = sampleHeight(wx, wz);
      const v = Math.max(0, Math.min(255, Math.round(((h - min) / range) * 255)));
      const i = (iy * size + ix) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, min, range, worldMin, worldSize };
}
