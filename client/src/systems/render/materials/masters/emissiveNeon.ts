// Neon signage master. Emissive is dim by day, ramps up at night, and `emissiveIntensity`>1 pushes
// luminance past the Bloom threshold so signs glow. Low porosity so wet nights don't kill the glow.
import * as THREE from "three";
import type { MasterOptions, PbrMaps } from "../types";
import { injectMaterial, makePerMaterial } from "./inject";
import { matNightEmissive } from "../chunks/emissive.glsl";

export function makeEmissiveNeon(maps: PbrMaps, opts: MasterOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.color ?? "#0a0a0a"),
    emissive: new THREE.Color(opts.emissive ?? "#ffffff"),
    emissiveIntensity: opts.emissiveIntensity ?? 2.2, // > 1 → blooms
    emissiveMap: maps.emissiveMap,
    roughness: opts.roughness ?? 0.6,
    metalness: 0,
  });
  return injectMaterial(m, {
    key: "emissive",
    perMaterial: makePerMaterial({ ...opts, porosity: opts.porosity ?? 0.2 }),
    afterEmissive: matNightEmissive,
  });
}
