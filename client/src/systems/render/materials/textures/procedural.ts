// Calibrated procedural fallback maps. v0 ships no CC0 `.ktx2` assets yet, so every material still
// gets real albedo/normal/ARM textures generated on a canvas — the block renders correctly today
// and simply swaps in higher-fidelity CC0 sets later (same slots, no shader recompile).
import * as THREE from "three";
import type { MaterialDef } from "../types";

const SIZE = 256;

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

// Deterministic value noise so a given def always generates the same look.
function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function fallbackTexture(color: string): THREE.DataTexture {
  const c = new THREE.Color(color);
  const data = new Uint8Array([
    Math.round(c.r * 255),
    Math.round(c.g * 255),
    Math.round(c.b * 255),
    255,
  ]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

function albedoTexture(def: MaterialDef): THREE.Texture {
  const made = makeCanvas();
  if (!made) return fallbackTexture(def.color ?? "#8a8f98");
  const { canvas, ctx } = made;
  const base = new THREE.Color(def.color ?? "#8a8f98");
  const img = ctx.createImageData(SIZE, SIZE);
  const seed = def.id.length * 3.13;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // two octaves of grain for surface variation
      const n =
        0.7 * hash2(Math.floor(x / 4), Math.floor(y / 4), seed) +
        0.3 * hash2(Math.floor(x / 16), Math.floor(y / 16), seed + 9);
      const shade = 0.82 + n * 0.36; // ~0.82..1.18
      const i = (y * SIZE + x) * 4;
      img.data[i] = Math.min(255, base.r * 255 * shade);
      img.data[i + 1] = Math.min(255, base.g * 255 * shade);
      img.data[i + 2] = Math.min(255, base.b * 255 * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function normalTexture(def: MaterialDef): THREE.Texture {
  const made = makeCanvas();
  if (!made) return fallbackTexture("#8080ff");
  const { canvas, ctx } = made;
  const img = ctx.createImageData(SIZE, SIZE);
  const seed = def.id.length * 1.77 + 5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // cheap derivative-of-noise → tangent-space normal perturbation (OpenGL convention)
      const h = hash2(Math.floor(x / 6), Math.floor(y / 6), seed);
      const hx = hash2(Math.floor(x / 6) + 1, Math.floor(y / 6), seed);
      const hy = hash2(Math.floor(x / 6), Math.floor(y / 6) + 1, seed);
      const nx = (h - hx) * 0.5;
      const ny = (h - hy) * 0.5;
      const i = (y * SIZE + x) * 4;
      img.data[i] = 128 + nx * 255;
      img.data[i + 1] = 128 + ny * 255; // +Y up (GL)
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

// Packed AO(R) / Roughness(G) / Metalness(B) — the ARM convention.
function armTexture(def: MaterialDef): THREE.Texture {
  const made = makeCanvas();
  const rough = Math.round((def.roughness ?? 0.9) * 255);
  const metal = Math.round((def.metalness ?? 0) * 255);
  if (!made) {
    const data = new Uint8Array([255, rough, metal, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const { canvas, ctx } = made;
  const img = ctx.createImageData(SIZE, SIZE);
  const seed = def.id.length * 2.51 + 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = hash2(Math.floor(x / 5), Math.floor(y / 5), seed);
      const i = (y * SIZE + x) * 4;
      img.data[i] = 235 + n * 20; // AO ~1
      img.data[i + 1] = Math.max(0, Math.min(255, rough + (n - 0.5) * 40)); // roughness grain
      img.data[i + 2] = metal;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function emissiveTexture(def: MaterialDef): THREE.Texture {
  return fallbackTexture(def.emissive ?? "#000000");
}

export interface ProceduralMaps {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
  emissive?: THREE.Texture;
}

export function makeProceduralPbr(def: MaterialDef): ProceduralMaps {
  const out: ProceduralMaps = {
    albedo: albedoTexture(def),
    normal: normalTexture(def),
    arm: armTexture(def),
  };
  if (def.maps?.emissive) out.emissive = emissiveTexture(def);
  return out;
}
