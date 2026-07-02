// Terrain build — a grid of tiles under one shared PBR material (uniform swaps only, no shader
// recompiles/hitches). Tiles are static (matrixAutoUpdate off) and distance/frustum-culled by
// the streaming system. LOD is approximated by segment count per ring from the world centre.

import * as THREE from "three";
import { BUILT_HALF, TILE_SIZE, TILES_PER_AXIS, type EnvQualitySettings } from "./constants";
import { buildTileGeometry } from "./heightfield";
import { makeTerrainMaterial, type TerrainTextures } from "./shaders";

export interface TerrainTile {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
}

export interface TerrainBuild {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  tiles: TerrainTile[];
  dispose(): void;
}

export function buildTerrain(tex: TerrainTextures, tier: EnvQualitySettings): TerrainBuild {
  const material = makeTerrainMaterial(tex);
  const group = new THREE.Group();
  group.name = "env:terrain";
  const tiles: TerrainTile[] = [];
  const start = -BUILT_HALF;
  const nearRing = TILE_SIZE * 2.5;

  for (let cz = 0; cz < TILES_PER_AXIS; cz++) {
    for (let cx = 0; cx < TILES_PER_AXIS; cx++) {
      const ox = start + cx * TILE_SIZE;
      const oz = start + cz * TILE_SIZE;
      const centerX = ox + TILE_SIZE / 2;
      const centerZ = oz + TILE_SIZE / 2;
      const ringDist = Math.hypot(centerX, centerZ);
      const segments = ringDist < nearRing ? tier.terrainSegNear : tier.terrainSegFar;

      const geo = buildTileGeometry(ox, oz, TILE_SIZE, segments);
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `env:terrainTile:${cx},${cz}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const center = new THREE.Vector3(centerX, 0, centerZ);
      mesh.userData.cullCenter = center;
      mesh.userData.envTile = { cx, cz };
      group.add(mesh);
      tiles.push({ mesh, center });
    }
  }

  const dispose = () => {
    for (const t of tiles) t.mesh.geometry.dispose();
    material.dispose();
    tex.albedo.dispose();
    tex.normal.dispose();
    tex.roughness.dispose();
    group.clear();
  };

  return { group, material, tiles, dispose };
}
