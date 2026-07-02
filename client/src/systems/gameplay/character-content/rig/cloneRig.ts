// Per-instance rig cloning. SkeletonUtils.clone deep-clones bones + SkinnedMeshes and rebinds them,
// while sharing geometry by reference — so cloning a character is cheap. We additionally collapse
// the per-mesh cloned skeletons into ONE (they all reference the same cloned bones) to cut GPU bone
// textures from N-per-character down to 1.

import * as THREE from "three";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

/** Deep-clone a rig template into an independent, animatable instance. */
export function cloneCharacter(template: THREE.Object3D): THREE.Object3D {
  return skeletonClone(template);
}

/** Make every SkinnedMesh under `root` share a single Skeleton object. Returns it (or undefined). */
export function unifySkeleton(root: THREE.Object3D): THREE.Skeleton | undefined {
  let shared: THREE.Skeleton | undefined;
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    if (!shared) {
      shared = mesh.skeleton;
    } else if (mesh.skeleton !== shared) {
      mesh.skeleton = shared;
      mesh.bind(shared, mesh.bindMatrix);
    }
  });
  return shared;
}

/** Bind an externally-built SkinnedMesh part to an existing skeleton (spec's rebindPart helper). */
export function rebindPart(part: THREE.SkinnedMesh, skeleton: THREE.Skeleton): void {
  part.bind(skeleton, part.bindMatrix ?? new THREE.Matrix4());
}
