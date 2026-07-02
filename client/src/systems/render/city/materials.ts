// Shared THREE materials + procedural (DOM-free) noise textures for the city. Kept to a small
// set of material families so draw calls stay low: one asphalt, one sidewalk, one ground, and
// three building families (opaque / glass / neon) that rely on per-vertex color so a single
// material renders the whole variety through a BatchedMesh.
//
// Textures are procedural stand-ins for the CC0 PBR sets in the asset catalog (ambientCG
// asphalt/concrete, KTX2 at build time). Swap `map` for the loaded KTX2 when the asset
// pipeline lands — the material wiring stays identical.
import * as THREE from "three";

function makeNoiseTexture(size: number, base: [number, number, number], variance: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * variance;
    data[i * 4 + 0] = Math.max(0, Math.min(255, (base[0] + n) * 255));
    data[i * 4 + 1] = Math.max(0, Math.min(255, (base[1] + n) * 255));
    data[i * 4 + 2] = Math.max(0, Math.min(255, (base[2] + n) * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
}

export interface CityMaterials {
  asphalt: THREE.MeshStandardMaterial;
  sidewalk: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  crosswalk: THREE.MeshBasicMaterial;
  buildingOpaque: THREE.MeshStandardMaterial;
  buildingGlass: THREE.MeshStandardMaterial;
  buildingNeon: THREE.MeshBasicMaterial;
  prop: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  lamp: THREE.MeshBasicMaterial;
  landmarkGlass: THREE.MeshStandardMaterial;
  landmarkNeon: THREE.MeshBasicMaterial;
  dispose: () => void;
}

/** Build the material set once (owns GPU resources → call `dispose()` on teardown). */
export function createCityMaterials(): CityMaterials {
  const asphaltTex = makeNoiseTexture(64, [0.1, 0.1, 0.12], 0.05);
  const concreteTex = makeNoiseTexture(64, [0.52, 0.52, 0.54], 0.08);

  // Flat ground decals are viewed from above only → DoubleSide sidesteps winding pitfalls.
  const asphalt = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.MeshStandardMaterial({ color: "#22262e", roughness: 1, metalness: 0 });
  const crosswalk = new THREE.MeshBasicMaterial({
    color: "#d8dbe0",
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const buildingOpaque = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 });
  const buildingGlass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.12,
    metalness: 0.55,
    transparent: true,
    opacity: 0.62,
  });
  const buildingNeon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 });
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const lamp = new THREE.MeshBasicMaterial({ color: "#ffe4a6", toneMapped: false });

  const landmarkGlass = new THREE.MeshStandardMaterial({
    color: "#bcdcff",
    roughness: 0.08,
    metalness: 0.7,
    transparent: true,
    opacity: 0.72,
  });
  const landmarkNeon = new THREE.MeshBasicMaterial({ color: "#ff5aa8", toneMapped: false });

  const textures = [asphaltTex, concreteTex];
  const materials = [
    asphalt,
    sidewalk,
    ground,
    crosswalk,
    buildingOpaque,
    buildingGlass,
    buildingNeon,
    prop,
    foliage,
    lamp,
    landmarkGlass,
    landmarkNeon,
  ];

  return {
    asphalt,
    sidewalk,
    ground,
    crosswalk,
    buildingOpaque,
    buildingGlass,
    buildingNeon,
    prop,
    foliage,
    lamp,
    landmarkGlass,
    landmarkNeon,
    dispose: () => {
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
