// Procedural low-poly car meshes. We render each ambient car through the ECS `three` view
// component (per the render brief) rather than a hand-mounted InstancedMesh, so every car is a
// small THREE.Group. Geometries + per-colour materials are cached module-side and shared across all
// cars, so the only per-spawn cost is a handful of Mesh wrappers (cheap; far cars are culled to
// invisible). A future perf pass can swap this for one InstancedMesh per class.
import * as THREE from "three";
import { CAR_Y } from "./config";

const BODY_W = 1.95;
const BODY_H = 0.5;
const BODY_L = 4.4;
const WHEEL_R = 0.34;

// Cached shared geometry (created lazily, reused forever).
let bodyGeo: THREE.BoxGeometry | null = null;
let cabinGeo: THREE.BoxGeometry | null = null;
let wheelGeo: THREE.CylinderGeometry | null = null;

const bodyMats = new Map<number, THREE.MeshStandardMaterial>();
let wheelMat: THREE.MeshStandardMaterial | null = null;
let glassMat: THREE.MeshStandardMaterial | null = null;

function ensureGeo(): void {
  if (bodyGeo) return;
  bodyGeo = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_L);
  cabinGeo = new THREE.BoxGeometry(BODY_W * 0.82, 0.42, BODY_L * 0.46);
  wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2); // axle along the car's X (width) axis
  wheelMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.85, metalness: 0.1 });
  glassMat = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.25, metalness: 0.6 });
}

function bodyMaterial(hex: number): THREE.MeshStandardMaterial {
  let m = bodyMats.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.2 });
    bodyMats.set(hex, m);
  }
  return m;
}

/**
 * Build a car group oriented +Z-forward (matches `yawFromDir`). Origin sits at the body centre,
 * `CAR_Y` above the road, so wheels graze the ground when the entity transform y = CAR_Y.
 */
export function createCarObject(colorHex: number): THREE.Group {
  ensureGeo();
  const g = new THREE.Group();

  const body = new THREE.Mesh(bodyGeo!, bodyMaterial(colorHex));
  body.position.y = 0.06;
  body.castShadow = true;
  body.receiveShadow = false;
  g.add(body);

  const cabin = new THREE.Mesh(cabinGeo!, glassMat!);
  cabin.position.set(0, 0.06 + BODY_H * 0.5 + 0.19, -0.15);
  cabin.castShadow = true;
  g.add(cabin);

  const wy = WHEEL_R - CAR_Y - 0.02;
  const wx = BODY_W * 0.48;
  const wz = BODY_L * 0.32;
  for (const [sx, sz] of [
    [wx, wz],
    [-wx, wz],
    [wx, -wz],
    [-wx, -wz],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo!, wheelMat!);
    wheel.position.set(sx, wy, sz);
    g.add(wheel);
  }

  g.castShadow = true;
  return g;
}

/** Recolour a pooled car group in place (body mesh is child 0). */
export function recolorCarObject(group: THREE.Group, colorHex: number): void {
  const body = group.children[0] as THREE.Mesh | undefined;
  if (body) body.material = bodyMaterial(colorHex);
}
