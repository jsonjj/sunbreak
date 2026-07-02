// Vehicle car-paint master. MeshPhysicalMaterial clearcoat over a metallic base, with wetness
// injected (cars bead and darken in the rain). Reserved for vehicles (Physical is heavier).
import * as THREE from "three";
import type { MasterOptions } from "../types";
import { injectMaterial, makePerMaterial } from "./inject";
import { matWetnessAlbedo, matWetnessFns, matWetnessRoughness } from "../chunks/wetness.glsl";

export function makeVehiclePhysical(opts: MasterOptions = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.color ?? "#b5121b"),
    metalness: opts.metalness ?? 0.9,
    roughness: opts.roughness ?? 0.35,
    clearcoat: opts.clearcoat ?? 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.2,
  });
  return injectMaterial(m, {
    key: "vehicle",
    perMaterial: makePerMaterial({ ...opts, porosity: opts.porosity ?? 0.25, puddleFactor: opts.puddleFactor ?? 0.4 }),
    fragFns: matWetnessFns,
    afterColor: matWetnessAlbedo,
    afterRoughness: matWetnessRoughness,
  });
}
