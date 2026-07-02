// Glass master. High/Medium tiers use MeshPhysicalMaterial transmission (real see-through glass);
// Low tier falls back to a cheap opaque, low-roughness, semi-transparent MeshStandardMaterial
// (transmission is expensive on integrated GPUs). Reserved for hero windows only.
import * as THREE from "three";
import type { MasterOptions, QualityTier } from "../types";

export function makeGlassPhysical(opts: MasterOptions = {}, tier: QualityTier = "high"): THREE.Material {
  const color = new THREE.Color(opts.color ?? "#cfe8ff");

  if (tier === "low") {
    const m = new THREE.MeshStandardMaterial({
      color,
      metalness: 0,
      roughness: opts.roughness ?? 0.08,
      transparent: true,
      opacity: 0.45,
      envMapIntensity: 1.5,
    });
    m.name = "glass-low";
    return m;
  }

  const m = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: opts.roughness ?? 0.05,
    transmission: opts.transmission ?? 1,
    ior: opts.ior ?? 1.45,
    thickness: 0.4,
    transparent: true,
    envMapIntensity: 1.4,
  });
  m.name = "glass";
  return m;
}
