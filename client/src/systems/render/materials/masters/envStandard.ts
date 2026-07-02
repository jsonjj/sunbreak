// The workhorse master: buildings, roads, props. MeshStandardMaterial with systemic wetness and
// (when the def is emissive) a night-emissive ramp injected. This is what the vast majority of
// Verano's surfaces reference — shared + instanced so thousands of meshes hit one program.
import * as THREE from "three";
import type { MasterOptions, PbrMaps } from "../types";
import { injectMaterial, makePerMaterial } from "./inject";
import { matWetnessAlbedo, matWetnessFns, matWetnessRoughness } from "../chunks/wetness.glsl";
import { matNightEmissive } from "../chunks/emissive.glsl";

export function makeEnvStandard(maps: PbrMaps, opts: MasterOptions = {}): THREE.MeshStandardMaterial {
  const emissive = opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0, 0, 0);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.color ?? "#8a8f98"),
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.0,
    emissive,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    map: maps.map,
    normalMap: maps.normalMap,
    aoMap: maps.aoMap,
    roughnessMap: maps.roughnessMap,
    metalnessMap: maps.metalnessMap,
    emissiveMap: maps.emissiveMap,
  });
  // ARM packing: AO in R on UV channel 0 (roughness=G, metalness=B are three's defaults).
  if (m.aoMap) m.aoMap.channel = 0;

  const hasEmissive = Boolean(opts.emissive);
  return injectMaterial(m, {
    key: hasEmissive ? "env+neon" : "env",
    perMaterial: makePerMaterial(opts),
    fragFns: matWetnessFns,
    afterColor: matWetnessAlbedo,
    afterRoughness: matWetnessRoughness,
    afterEmissive: hasEmissive ? matNightEmissive : undefined,
  });
}
