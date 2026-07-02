// Procedural placeholders. Because no real binaries are downloaded during the wave, every asset
// still resolves to a real, renderable/playable THREE resource built here from a small spec.
// This is what lets dependent subsystems (vehicles, peds, city, audio…) run TODAY against keys.
//
// Notes:
//  - Models are built as Groups tagged `userData.placeholder = true`; ./loader caches a template
//    per key and hands out `.clone()`s so per-entity transforms stay independent.
//  - Textures/HDRI use a 2D canvas (guarded for non-DOM); audio synthesizes a tiny WAV data URL.
//  - Everything uses only `three` core (a pre-installed dep) — no example modules needed here.

import * as THREE from "three";
import type {
  AudioPlaceholder,
  HdriPlaceholder,
  ModelPlaceholder,
  TexturePlaceholder,
} from "./types";

const hasDom = typeof document !== "undefined";

function hexCss(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

function standardMaterial(spec: {
  color: number;
  emissive?: number;
  metalness?: number;
  roughness?: number;
}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissive ? 1 : 0,
    metalness: spec.metalness ?? 0.1,
    roughness: spec.roughness ?? 0.85,
  });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ── Models ───────────────────────────────────────────────────────────────────────────────────

function buildCapsule(spec: ModelPlaceholder): THREE.Object3D {
  const g = new THREE.Group();
  const [w, h, d] = spec.size;
  const radius = Math.max(0.1, Math.min(w, d) / 2);
  const cylLen = Math.max(0.01, h - radius * 2);
  const material = standardMaterial(spec);
  const body = mesh(new THREE.CapsuleGeometry(radius, cylLen, 6, 12), material, "body");
  body.position.y = h / 2;
  g.add(body);
  // A small "nose" wedge so orientation (facing +Z) reads at a glance.
  const nose = mesh(
    new THREE.ConeGeometry(radius * 0.35, radius * 0.9, 8),
    standardMaterial({ color: 0x1b1e28 }),
    "facing",
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, h * 0.72, radius * 0.9);
  g.add(nose);
  return g;
}

function buildCar(spec: ModelPlaceholder): THREE.Object3D {
  const g = new THREE.Group();
  const [w, h, l] = spec.size;
  const wheelR = Math.min(0.45, Math.max(0.25, h * 0.3));
  const bodyMat = standardMaterial(spec);
  const chassis = mesh(new THREE.BoxGeometry(w, h * 0.5, l), bodyMat, "chassis");
  chassis.position.y = wheelR + h * 0.25;
  g.add(chassis);
  const cabin = mesh(
    new THREE.BoxGeometry(w * 0.82, h * 0.42, l * 0.5),
    standardMaterial({ color: 0x11151d, roughness: 0.25, metalness: 0.1 }),
    "cabin",
  );
  cabin.position.set(0, wheelR + h * 0.5 + h * 0.2, -l * 0.05);
  g.add(cabin);
  const wheelMat = standardMaterial({ color: 0x0c0d10, roughness: 0.9, metalness: 0.05 });
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, w * 0.12, 16);
  const dx = w / 2;
  const dz = l * 0.32;
  const corners: ReadonlyArray<readonly [number, number, string]> = [
    [dx, dz, "wheel_FR"],
    [-dx, dz, "wheel_FL"],
    [dx, -dz, "wheel_RR"],
    [-dx, -dz, "wheel_RL"],
  ];
  for (const [x, z, name] of corners) {
    const wheel = mesh(wheelGeo, wheelMat, name);
    wheel.rotation.z = Math.PI / 2; // spin axis along X
    wheel.position.set(x, wheelR, z);
    g.add(wheel);
  }
  return g;
}

function buildWheel(spec: ModelPlaceholder): THREE.Object3D {
  const [w, h] = spec.size;
  const r = Math.max(0.2, h / 2);
  const wheel = mesh(
    new THREE.CylinderGeometry(r, r, Math.max(0.1, w), 18),
    standardMaterial({ color: spec.color, roughness: 0.9, metalness: 0.05 }),
    "wheel",
  );
  wheel.rotation.z = Math.PI / 2;
  const g = new THREE.Group();
  g.add(wheel);
  return g;
}

function buildWeapon(spec: ModelPlaceholder): THREE.Object3D {
  const g = new THREE.Group();
  const [w, h, l] = spec.size;
  const mat = standardMaterial({ color: spec.color, metalness: 0.7, roughness: 0.35 });
  const receiver = mesh(new THREE.BoxGeometry(w, h, l * 0.6), mat, "receiver");
  g.add(receiver);
  const barrel = mesh(new THREE.BoxGeometry(w * 0.5, h * 0.5, l * 0.6), mat, "barrel");
  barrel.position.set(0, h * 0.1, l * 0.55);
  g.add(barrel);
  const grip = mesh(new THREE.BoxGeometry(w * 0.8, h * 1.2, l * 0.25), mat, "grip");
  grip.position.set(0, -h * 0.7, -l * 0.2);
  g.add(grip);
  return g;
}

function buildBuilding(spec: ModelPlaceholder): THREE.Object3D {
  const [w, h, d] = spec.size;
  const b = mesh(new THREE.BoxGeometry(w, h, d), standardMaterial(spec), "building");
  b.position.y = h / 2;
  const g = new THREE.Group();
  g.add(b);
  return g;
}

function buildRoad(spec: ModelPlaceholder): THREE.Object3D {
  const [w, h, d] = spec.size;
  const t = Math.max(0.02, h);
  const tile = mesh(
    new THREE.BoxGeometry(w, t, d),
    standardMaterial({ color: spec.color, roughness: 0.95 }),
    "road",
  );
  tile.position.y = t / 2;
  const g = new THREE.Group();
  g.add(tile);
  return g;
}

function buildTree(spec: ModelPlaceholder): THREE.Object3D {
  const g = new THREE.Group();
  const [w, h] = spec.size;
  const trunkH = h * 0.42;
  const trunk = mesh(
    new THREE.CylinderGeometry(w * 0.08, w * 0.1, trunkH, 8),
    standardMaterial({ color: 0x5b3a21, roughness: 1 }),
    "trunk",
  );
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const canopy = mesh(
    new THREE.IcosahedronGeometry(w * 0.5, 1),
    standardMaterial({ color: spec.color, roughness: 0.95 }),
    "canopy",
  );
  canopy.position.y = trunkH + w * 0.4;
  canopy.scale.set(1, 1.2, 1);
  g.add(canopy);
  return g;
}

function buildSign(spec: ModelPlaceholder): THREE.Object3D {
  const [w, h] = spec.size;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.emissive ?? spec.color,
      emissiveIntensity: 1.4,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0,
    }),
  );
  plane.name = "sign";
  const g = new THREE.Group();
  g.add(plane);
  return g;
}

function buildBox(spec: ModelPlaceholder): THREE.Object3D {
  const [w, h, d] = spec.size;
  const b = mesh(new THREE.BoxGeometry(w, h, d), standardMaterial(spec), "box");
  b.position.y = h / 2;
  const g = new THREE.Group();
  g.add(b);
  return g;
}

/** Build a fresh procedural model for the given spec. `label` becomes the group name. */
export function createPlaceholderModel(spec: ModelPlaceholder, label: string = spec.shape): THREE.Object3D {
  let obj: THREE.Object3D;
  switch (spec.shape) {
    case "capsule":
      obj = buildCapsule(spec);
      break;
    case "car":
      obj = buildCar(spec);
      break;
    case "wheel":
      obj = buildWheel(spec);
      break;
    case "weapon":
      obj = buildWeapon(spec);
      break;
    case "building":
      obj = buildBuilding(spec);
      break;
    case "road":
      obj = buildRoad(spec);
      break;
    case "tree":
      obj = buildTree(spec);
      break;
    case "sign":
      obj = buildSign(spec);
      break;
    default:
      obj = buildBox(spec);
      break;
  }
  obj.name = label;
  obj.userData.placeholder = true;
  return obj;
}

// ── Textures ───────────────────────────────────────────────────────────────────────────────

function solidDataTexture(color: number): THREE.DataTexture {
  const c = new THREE.Color(color);
  const data = new Uint8Array([
    Math.round(c.r * 255),
    Math.round(c.g * 255),
    Math.round(c.b * 255),
    255,
  ]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function paintSurface(ctx: CanvasRenderingContext2D, size: number, spec: TexturePlaceholder): void {
  const base = hexCss(spec.color);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const speckle = (count: number, alpha: number, spread: number, dark: boolean) => {
    for (let i = 0; i < count; i++) {
      const shade = dark ? 0 : 255;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
      const r = Math.random() * spread + 0.5;
      ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
    }
  };
  switch (spec.pattern) {
    case "asphalt":
      speckle(2600, 0.06, 2.2, true);
      speckle(1400, 0.05, 1.6, false);
      break;
    case "concrete":
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.04})`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 40 + 10, 0, Math.PI * 2);
        ctx.fill();
      }
      speckle(800, 0.04, 1.4, true);
      break;
    case "paving": {
      const tiles = 4;
      const step = size / tiles;
      for (let x = 0; x < tiles; x++) {
        for (let y = 0; y < tiles; y++) {
          ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
          ctx.fillRect(x * step, y * step, step, step);
        }
      }
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      for (let i = 0; i <= tiles; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, size);
        ctx.moveTo(0, i * step);
        ctx.lineTo(size, i * step);
        ctx.stroke();
      }
      break;
    }
    case "stucco":
      speckle(3000, 0.03, 1.2, true);
      speckle(1500, 0.03, 1.2, false);
      break;
    case "sand":
      speckle(4000, 0.05, 1.4, true);
      speckle(2000, 0.05, 1.2, false);
      break;
    case "metal": {
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, "rgba(255,255,255,0.25)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.0)");
      grad.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case "glass": {
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, "rgba(255,255,255,0.35)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.05)");
      grad.addColorStop(1, "rgba(0,0,0,0.15)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case "brick": {
      const rows = 8;
      const rh = size / rows;
      const bw = size / 4;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, size, size);
      for (let r = 0; r < rows; r++) {
        const offset = r % 2 === 0 ? 0 : -bw / 2;
        for (let c = -1; c < 4; c++) {
          ctx.fillStyle = spec.color ? base : "#8a4b3a";
          ctx.fillRect(c * bw + offset + 2, r * rh + 2, bw - 4, rh - 4);
        }
      }
      break;
    }
    default: {
      const cells = 8;
      const cs = size / cells;
      for (let x = 0; x < cells; x++) {
        for (let y = 0; y < cells; y++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? base : "#ff00ea";
          ctx.fillRect(x * cs, y * cs, cs, cs);
        }
      }
    }
  }
}

/** Build a repeating base-color texture approximating the surface. */
export function createPlaceholderTexture(spec: TexturePlaceholder): THREE.Texture {
  if (!hasDom) return solidDataTexture(spec.color);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return solidDataTexture(spec.color);
  paintSurface(ctx, size, spec);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const [rx, ry] = spec.repeat ?? [1, 1];
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** A standard material wrapping the placeholder texture (roughness/metalness from the spec). */
export function createPlaceholderMaterial(spec: TexturePlaceholder): THREE.MeshStandardMaterial {
  const map = createPlaceholderTexture(spec);
  const isGlass = spec.pattern === "glass";
  return new THREE.MeshStandardMaterial({
    map,
    roughness: spec.roughness ?? (spec.pattern === "metal" ? 0.4 : 0.9),
    metalness: spec.metalness ?? (spec.pattern === "metal" ? 0.9 : 0.05),
    transparent: isGlass,
    opacity: isGlass ? 0.55 : 1,
  });
}

// ── HDRI / environment ─────────────────────────────────────────────────────────────────────

/** Build an equirectangular gradient stand-in usable as scene.environment/background. */
export function createPlaceholderEnvironment(spec: HdriPlaceholder): THREE.Texture {
  if (!hasDom) {
    const tex = solidDataTexture(spec.horizon);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = solidDataTexture(spec.horizon);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, hexCss(spec.zenith));
  grad.addColorStop(0.5, hexCss(spec.horizon));
  grad.addColorStop(0.5, hexCss(spec.horizon));
  grad.addColorStop(1, hexCss(spec.ground));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  if (spec.sun) {
    const sunGrad = ctx.createRadialGradient(w * 0.5, h * 0.46, 4, w * 0.5, h * 0.46, 90);
    sunGrad.addColorStop(0, "rgba(255,244,214,1)");
    sunGrad.addColorStop(1, "rgba(255,244,214,0)");
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ── Audio (tiny synthesized WAV data URL) ───────────────────────────────────────────────────

const SAMPLE_RATE = 22050;

function synthSamples(spec: AudioPlaceholder): Float32Array {
  const n = Math.max(1, Math.round((spec.durationMs / 1000) * SAMPLE_RATE));
  const out = new Float32Array(n);
  const gain = spec.gain ?? 0.4;
  const f = spec.freqHz ?? 220;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const p = i / n; // 0..1 progress
    let s = 0;
    switch (spec.tone) {
      case "click":
        s = (Math.random() * 2 - 1) * Math.exp(-p * 40);
        break;
      case "thud":
        s = Math.sin(2 * Math.PI * 90 * t) * Math.exp(-p * 8);
        break;
      case "engine":
        s =
          (Math.sin(2 * Math.PI * f * t) +
            0.5 * Math.sin(2 * Math.PI * f * 2 * t) +
            0.25 * Math.sin(2 * Math.PI * f * 3 * t)) /
          1.75;
        s += (Math.random() * 2 - 1) * 0.05;
        break;
      case "siren": {
        const sweep = 600 + 400 * Math.sin(2 * Math.PI * 1.5 * t);
        s = Math.sin(2 * Math.PI * sweep * t);
        break;
      }
      case "beep":
        s = Math.sin(2 * Math.PI * f * t) * (p < 0.9 ? 1 : 1 - (p - 0.9) / 0.1);
        break;
      case "noise":
        s = Math.random() * 2 - 1;
        break;
      case "silence":
      default:
        s = 0;
    }
    // Short attack/release to avoid boundary clicks.
    const env = Math.min(1, p / 0.02) * Math.min(1, (1 - p) / 0.02);
    out[i] = s * gain * (spec.tone === "silence" ? 0 : env);
  }
  return out;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function encodeWav(samples: Float32Array): string {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(off, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    off += 2;
  }
  return `data:audio/wav;base64,${base64FromBytes(new Uint8Array(buffer))}`;
}

/** Synthesize a short, playable WAV data URL for the audio spec (empty string if no `btoa`). */
export function createPlaceholderAudioDataUrl(spec: AudioPlaceholder): string {
  if (typeof btoa === "undefined") return "";
  return encodeWav(synthSamples(spec));
}
