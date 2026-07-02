// Instanced ambient props (one draw call per type). `collides` types (rocks, pilings) also emit
// serialisable collider descriptors the physics subsystem can turn into static Rapier colliders
// for cover / obstruction. Everything is deterministic (scatter.ts).

import * as THREE from "three";
import { Layer } from "@sunbreak/shared";
import { COAST_BOUNDS, WATER_LEVEL, type EnvQualitySettings } from "./constants";
import { gladesMask } from "./biomes";
import { clamp01 } from "./noise";
import { scatterField, type ScatterInstance } from "./scatter";
import { makeRock, makeDriftwood, makePiling, makeBuoy, makeUmbrella } from "./geometry";

/** Serialisable static collider description handed to the physics subsystem. */
export interface EnvColliderDesc {
  shape: "box" | "cylinder" | "sphere";
  position: { x: number; y: number; z: number };
  rotationY: number;
  halfExtents?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
  /** shared `Layer` enum value → physics packs via groupsFor(layer). */
  layer: number;
}

export interface PropType {
  name: string;
  mesh: THREE.InstancedMesh;
  count: number;
}

export interface PropsBuild {
  group: THREE.Group;
  types: PropType[];
  colliders: EnvColliderDesc[];
  dispose(): void;
}

const _dummy = new THREE.Object3D();

function fillInstanced(
  mesh: THREE.InstancedMesh,
  rows: ScatterInstance[],
  yOverride?: number,
): void {
  for (let i = 0; i < rows.length; i++) {
    const it = rows[i]!;
    _dummy.position.set(it.x, yOverride ?? it.y, it.z);
    _dummy.rotation.set(0, it.rotationY, 0);
    _dummy.scale.setScalar(it.scale);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function buildProps(tier: EnvQualitySettings): PropsBuild {
  const d = tier.foliageDensity;
  const group = new THREE.Group();
  group.name = "env:props";
  const types: PropType[] = [];
  const colliders: EnvColliderDesc[] = [];

  const addType = (
    name: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    rows: ScatterInstance[],
    castShadow: boolean,
    yOverride?: number,
  ): void => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, rows.length));
    mesh.name = `env:props:${name}`;
    mesh.count = rows.length;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.userData.cullCenter = new THREE.Vector3(0, 0, 0);
    fillInstanced(mesh, rows, yOverride);
    group.add(mesh);
    types.push({ name, mesh, count: rows.length });
  };

  // --- rocks (beach + inland; collide as cover) ---
  {
    const geo = makeRock(7);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8b8578,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    });
    const rows = scatterField({
      channel: 11,
      spacing: 11,
      minHeight: -0.25,
      maxHeight: 1.2,
      minScale: 0.5,
      maxScale: 1.8,
      maxCount: Math.floor(240 * d),
      bounds: COAST_BOUNDS,
      density: (_x, _z, s) =>
        s.biome === "ocean" || s.biome === "bay"
          ? 0
          : clamp01(s.weights.rock * 1.4 + s.weights.sand * 0.25 + 0.1),
    });
    addType("rock", geo, mat, rows, true);
    for (const it of rows) {
      colliders.push({
        shape: "sphere",
        position: { x: it.x, y: it.y + it.scale * 0.3, z: it.z },
        rotationY: 0,
        radius: it.scale * 0.85,
        layer: Layer.PROP,
      });
    }
  }

  // --- driftwood (beach near shore; decorative) ---
  {
    const geo = makeDriftwood();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a7b53, roughness: 0.9, metalness: 0 });
    const rows = scatterField({
      channel: 12,
      spacing: 9,
      minHeight: -1.0,
      maxHeight: -0.05,
      minScale: 0.7,
      maxScale: 1.6,
      maxCount: Math.floor(180 * d),
      bounds: COAST_BOUNDS,
      density: (_x, _z, s) => (s.biome === "beach" ? clamp01(s.weights.sand) * 0.8 : 0),
    });
    addType("driftwood", geo, mat, rows, true);
  }

  // --- pilings (shallow water at bay + glades edges; collide) ---
  {
    const geo = makePiling();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5b4a34, roughness: 0.9, metalness: 0 });
    const rows = scatterField({
      channel: 13,
      spacing: 7,
      minHeight: -2.4,
      maxHeight: -0.2,
      minScale: 0.8,
      maxScale: 1.25,
      maxCount: Math.floor(120 * d),
      density: (x, z, s) => {
        const g = gladesMask(x, z);
        const shallow = s.height < -0.2 && s.height > -2.4 ? 1 : 0;
        return shallow * (g > 0.3 ? 0.5 : 0.18);
      },
    });
    addType("piling", geo, mat, rows, true);
    for (const it of rows) {
      colliders.push({
        shape: "cylinder",
        position: { x: it.x, y: it.y + it.scale * 1.6, z: it.z },
        rotationY: 0,
        radius: it.scale * 0.26,
        height: it.scale * 3.2,
        layer: Layer.PROP,
      });
    }
  }

  // --- buoys (float in near-shore water) ---
  {
    const geo = makeBuoy();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
    const rows = scatterField({
      channel: 14,
      spacing: 22,
      minHeight: -8,
      maxHeight: -1.4,
      minScale: 0.8,
      maxScale: 1.3,
      maxCount: Math.floor(60 * d),
      density: (_x, _z, s) => (s.height < -1.6 && s.height > -8 ? 0.5 : 0),
    });
    addType("buoy", geo, mat, rows, false, WATER_LEVEL);
  }

  // --- umbrellas (dry beach) ---
  {
    const geo = makeUmbrella();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    const rows = scatterField({
      channel: 15,
      spacing: 16,
      minHeight: -0.25,
      maxHeight: 0.3,
      maxSlope: 0.4,
      minScale: 0.9,
      maxScale: 1.25,
      maxCount: Math.floor(70 * d),
      bounds: COAST_BOUNDS,
      density: (_x, _z, s) => (s.biome === "beach" ? clamp01(s.weights.sand) * 0.5 : 0),
    });
    addType("umbrella", geo, mat, rows, true);
  }

  const dispose = () => {
    for (const t of types) {
      t.mesh.geometry.dispose();
      const m = t.mesh.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m.dispose();
      t.mesh.dispose();
    }
    group.clear();
  };

  return { group, types, colliders, dispose };
}
