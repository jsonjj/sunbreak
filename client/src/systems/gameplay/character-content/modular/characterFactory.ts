// Assembles a concrete character from a rig template + an Appearance: clone the template, collapse
// to one skeleton, then per SkinnedMesh toggle wardrobe visibility and assign a cached tinted
// material. Geometry is shared across all clones; materials are shared across the whole crowd.

import * as THREE from "three";
import type { Appearance } from "../types";
import { cloneCharacter, unifySkeleton } from "../rig/cloneRig";
import type { PartUserData } from "../rig/proceduralHumanoid";
import type { MaterialCache } from "./materialCache";

/** Build a ready character Object3D (origin at feet, faces -Z). */
export function buildCharacter(
  template: THREE.Object3D,
  appearance: Appearance,
  materials: MaterialCache,
  castShadow = true,
): THREE.Object3D {
  const root = cloneCharacter(template);
  unifySkeleton(root);

  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const ud = mesh.userData as PartUserData;

    if (ud.base) {
      mesh.visible = true;
      mesh.material = materials.get(ud.channel, appearance.palette);
      mesh.castShadow = castShadow;
      return;
    }

    if (ud.slot) {
      const chosen = appearance.wardrobe[ud.slot] ?? null;
      const on = chosen != null && chosen === ud.variant;
      mesh.visible = on;
      if (on) {
        mesh.material = materials.get(ud.channel, appearance.palette);
        mesh.castShadow = castShadow;
      }
    }
  });

  root.name = `char:${appearance.bodyId}`;
  return root;
}
