// Foliage/cloth master. Alpha-tested cutouts, double-sided, with vertex wind sway driven by the
// global uWind. Shares the wetness chunk so leaves darken in the rain like everything else.
import * as THREE from "three";
import type { MasterOptions, PbrMaps } from "../types";
import { injectMaterial, makePerMaterial } from "./inject";
import { matWetnessAlbedo, matWetnessFns, matWetnessRoughness } from "../chunks/wetness.glsl";
import { matWindApply, matWindFns } from "../chunks/wind.glsl";

export function makeFoliageStandard(maps: PbrMaps, opts: MasterOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.color ?? "#3f7d3a"),
    roughness: opts.roughness ?? 0.9,
    metalness: 0,
    map: maps.map,
    normalMap: maps.normalMap,
    aoMap: maps.aoMap,
    roughnessMap: maps.roughnessMap,
    metalnessMap: maps.metalnessMap,
    alphaTest: opts.alphaTest ?? 0.5,
    side: THREE.DoubleSide,
  });
  if (m.aoMap) m.aoMap.channel = 0;

  return injectMaterial(m, {
    key: "foliage",
    perMaterial: makePerMaterial({ ...opts, puddleFactor: opts.puddleFactor ?? 0 }),
    fragFns: matWetnessFns,
    vertFns: matWindFns,
    afterColor: matWetnessAlbedo,
    afterRoughness: matWetnessRoughness,
    windVertex: matWindApply,
  });
}
