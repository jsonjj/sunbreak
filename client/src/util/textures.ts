import * as THREE from "three";

/** Procedurally generated grid texture — keeps v0 fully offline/free (no CC0 downloads yet).
 *  Real CC0 PBR textures (ambientCG/Poly Haven) arrive with the materials subsystem. */
export function makeGridTexture(
  size = 512,
  cells = 8,
  bg = "#2f3440",
  line = "#4a5160",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, size / 256);

  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
