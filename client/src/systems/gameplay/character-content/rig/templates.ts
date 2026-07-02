// Resolves a rig template to clone per character. Prefers a vendored CC0 GLB template (registered
// at preload) for a given body proportion, and falls back to the procedural template so the
// pipeline always has something real to clone.

import type * as THREE from "three";
import type { BodyId } from "../types";
import { getProceduralTemplate } from "./proceduralHumanoid";

const external = new Map<BodyId, THREE.Object3D>();

export function registerExternalTemplate(bodyId: BodyId, template: THREE.Object3D): void {
  external.set(bodyId, template);
}

export function hasExternalTemplate(bodyId: BodyId): boolean {
  return external.has(bodyId);
}

/** The template to SkeletonUtils.clone for this body. */
export function getTemplate(bodyId: BodyId): THREE.Object3D {
  return external.get(bodyId) ?? getProceduralTemplate(bodyId);
}
