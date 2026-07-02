// Instanced foliage. One geometry + one wind material per species; instances are bucketed into
// spatial cells so the streaming system can distance/frustum-cull whole cells. Alpha-TESTED
// grass (never blended) avoids sort/overdraw. All placement is deterministic (scatter.ts).

import * as THREE from "three";
import { COAST_BOUNDS, GLADES_BOUNDS, TILE_SIZE, type EnvQualitySettings } from "./constants";
import { gladesMask } from "./biomes";
import { clamp01 } from "./noise";
import { scatterField, type ScatterInstance } from "./scatter";
import { makeGrassClump, makePalm, makeCypress, makeMangrove } from "./geometry";
import { makeBladeTexture } from "./textures";
import { makeWindMaterial } from "./shaders";

export interface FoliageSpecies {
  name: string;
  group: THREE.Group;
  count: number;
  dispose(): void;
}

const FOLIAGE_CELL = TILE_SIZE;
const _dummy = new THREE.Object3D();

function cellCenterKey(x: number, z: number): string {
  return `${Math.floor(x / FOLIAGE_CELL)},${Math.floor(z / FOLIAGE_CELL)}`;
}

/** Bucket instances into cells and build one InstancedMesh per cell (shared geo + material). */
function buildCellGroup(
  name: string,
  instances: ScatterInstance[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  opts: { castShadow: boolean; yOffset?: number },
): THREE.Group {
  const group = new THREE.Group();
  group.name = `env:foliage:${name}`;
  const cells = new Map<string, ScatterInstance[]>();
  for (const inst of instances) {
    const key = cellCenterKey(inst.x, inst.z);
    let arr = cells.get(key);
    if (!arr) {
      arr = [];
      cells.set(key, arr);
    }
    arr.push(inst);
  }

  for (const arr of cells.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, arr.length);
    mesh.castShadow = opts.castShadow;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i]!;
      _dummy.position.set(it.x, it.y + (opts.yOffset ?? 0), it.z);
      _dummy.rotation.set(0, it.rotationY, 0);
      _dummy.scale.setScalar(it.scale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      sx += it.x;
      sz += it.z;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.cullCenter = new THREE.Vector3(sx / arr.length, 0, sz / arr.length);
    group.add(mesh);
  }
  return group;
}

export function buildFoliage(tier: EnvQualitySettings): FoliageSpecies[] {
  const d = tier.foliageDensity;
  const species: FoliageSpecies[] = [];

  // Each species builds in isolation: if one throws (bad geometry, scatter, …) it's logged once and
  // skipped so the remaining species still populate the world.
  const faults = new Set<string>();
  const trySpecies = (name: string, build: () => FoliageSpecies): void => {
    try {
      species.push(build());
    } catch (err) {
      if (!faults.has(name)) {
        faults.add(name);
        console.error(`[env] foliage species "${name}" failed to build; skipping it:`, err);
      }
    }
  };

  // Shared textures/materials per species (disposed with the species).
  const grassTex = makeBladeTexture(128, "#7c9a42");
  const sawTex = makeBladeTexture(128, "#93a24e");

  const grassMat = makeWindMaterial({
    map: grassTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.92,
    windStrength: 1,
  });
  const sawMat = makeWindMaterial({
    map: sawTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.9,
    windStrength: 1.15,
  });
  const treeMat = makeWindMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    windStrength: 0.45,
  });

  // --- dune grass (beach + low inland) ---
  trySpecies("duneGrass", () => {
    const geo = makeGrassClump(0.7, 0.65, 3);
    const rows = scatterField({
      channel: 1,
      spacing: 3.2,
      minHeight: -0.25,
      maxHeight: 0.5,
      maxSlope: 0.55,
      minScale: 0.55,
      maxScale: 1.15,
      maxCount: Math.floor(6500 * d),
      bounds: COAST_BOUNDS,
      density: (_x, _z, s) =>
        s.biome === "beach" || s.biome === "inland"
          ? clamp01(s.weights.sand * 0.7 + s.weights.grass * 1.2)
          : 0,
    });
    const group = buildCellGroup("duneGrass", rows, geo, grassMat, { castShadow: false });
    return {
      name: "duneGrass",
      group,
      count: rows.length,
      dispose: () => {
        geo.dispose();
        grassMat.dispose();
        grassTex.dispose();
      },
    };
  });

  // --- sawgrass (Glades shallows) ---
  trySpecies("sawgrass", () => {
    const geo = makeGrassClump(0.8, 1.5, 3);
    const rows = scatterField({
      channel: 2,
      spacing: 2.1,
      minHeight: -1.2,
      maxHeight: -0.05,
      maxSlope: 0.6,
      minScale: 0.7,
      maxScale: 1.4,
      maxCount: Math.floor(5500 * d),
      bounds: GLADES_BOUNDS,
      density: (x, z, s) => {
        const g = gladesMask(x, z);
        return g < 0.3 ? 0 : clamp01(g * 1.15) * (s.height > -0.6 ? 1 : 0.35);
      },
    });
    const group = buildCellGroup("sawgrass", rows, geo, sawMat, { castShadow: false });
    return {
      name: "sawgrass",
      group,
      count: rows.length,
      dispose: () => {
        geo.dispose();
        sawMat.dispose();
        sawTex.dispose();
      },
    };
  });

  // --- palms (Costa Dorada beach + low inland) ---
  trySpecies("palm", () => {
    const geo = makePalm();
    const rows = scatterField({
      channel: 3,
      spacing: 14,
      minHeight: -0.25,
      maxHeight: 1.0,
      maxSlope: 0.5,
      minScale: 0.8,
      maxScale: 1.45,
      maxCount: Math.floor(300 * d),
      bounds: COAST_BOUNDS,
      density: (_x, _z, s) =>
        s.biome === "ocean" || s.biome === "bay"
          ? 0
          : clamp01(s.weights.sand * 0.5 + s.weights.grass * 0.7) * 0.55,
    });
    const group = buildCellGroup("palm", rows, geo, treeMat, { castShadow: true });
    return {
      name: "palm",
      group,
      count: rows.length,
      dispose: () => geo.dispose(),
    };
  });

  // --- cypress (Glades hummocks) ---
  trySpecies("cypress", () => {
    const geo = makeCypress();
    const rows = scatterField({
      channel: 4,
      spacing: 16,
      minHeight: -0.7,
      maxHeight: 1.6,
      maxSlope: 0.6,
      minScale: 0.85,
      maxScale: 1.5,
      maxCount: Math.floor(220 * d),
      bounds: GLADES_BOUNDS,
      density: (x, z) => {
        const g = gladesMask(x, z);
        return g < 0.4 ? 0 : clamp01(g);
      },
    });
    const group = buildCellGroup("cypress", rows, geo, treeMat, { castShadow: true });
    return {
      name: "cypress",
      group,
      count: rows.length,
      dispose: () => geo.dispose(),
    };
  });

  // --- mangrove (Glades water edge) ---
  trySpecies("mangrove", () => {
    const geo = makeMangrove();
    const rows = scatterField({
      channel: 5,
      spacing: 14,
      minHeight: -1.2,
      maxHeight: -0.05,
      maxSlope: 0.7,
      minScale: 0.8,
      maxScale: 1.35,
      maxCount: Math.floor(240 * d),
      bounds: GLADES_BOUNDS,
      density: (x, z) => {
        const g = gladesMask(x, z);
        return g < 0.35 ? 0 : clamp01(g * 0.9);
      },
    });
    const group = buildCellGroup("mangrove", rows, geo, treeMat, { castShadow: true });
    return {
      name: "mangrove",
      group,
      count: rows.length,
      dispose: () => {
        geo.dispose();
        treeMat.dispose(); // treeMat shared across palm/cypress/mangrove; dispose with the last
      },
    };
  });

  return species;
}
