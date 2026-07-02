// Helpers that build simple limb/torso primitives in rest-world space and rigidly skin them to a
// single canonical bone. Merging several of these yields one SkinnedMesh per wardrobe slot that
// deforms correctly under the shared skeleton — the "modular part" building block.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BONE_INDEX, restWorld, type BoneName } from "./skeleton";

const UP = new THREE.Vector3(0, 1, 0);

/** Assign every vertex a single-bone (rigid) skin weight. Bone indices are GLOBAL (BONE_INDEX),
 *  so merged parts never need remapping. */
function skinRigid(geo: THREE.BufferGeometry, boneIndex: number): THREE.BufferGeometry {
  const count = geo.getAttribute("position").count;
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    si[i * 4] = boneIndex;
    sw[i * 4] = 1;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  // Keep attribute sets identical across parts so mergeGeometries() succeeds.
  if (!geo.getAttribute("uv")) {
    const uv = new Float32Array(count * 2);
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  }
  return geo;
}

/** Capsule spanning bone `a`..`b`, skinned rigidly to `bone`. Ends overlap the joints slightly. */
export function capsule(
  a: BoneName,
  b: BoneName,
  radius: number,
  bone: BoneName,
  taper = 1,
): THREE.BufferGeometry {
  const pa = restWorld(a);
  const pb = restWorld(b);
  const dir = new THREE.Vector3().subVectors(pb, pa);
  const len = dir.length() || 0.001;
  dir.multiplyScalar(1 / len);
  const cyl = Math.max(len - radius * 0.6, 0.02);
  const geo = new THREE.CapsuleGeometry(radius, cyl, 5, 10);
  if (taper !== 1) geo.scale(taper, 1, taper);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
  geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return skinRigid(geo, BONE_INDEX[bone]);
}

/** Sphere/ellipsoid centered near a bone, skinned rigidly to it. */
export function sphere(
  at: BoneName,
  radius: number,
  bone: BoneName,
  opts?: { scale?: readonly [number, number, number]; offset?: readonly [number, number, number] },
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 14, 10);
  const s = opts?.scale;
  if (s) geo.scale(s[0], s[1], s[2]);
  const p = restWorld(at);
  const o = opts?.offset;
  if (o) p.add(new THREE.Vector3(o[0], o[1], o[2]));
  geo.translate(p.x, p.y, p.z);
  return skinRigid(geo, BONE_INDEX[bone]);
}

/** Box centered near a bone, skinned rigidly to it. */
export function box(
  at: BoneName,
  size: readonly [number, number, number],
  bone: BoneName,
  opts?: { offset?: readonly [number, number, number] },
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const p = restWorld(at);
  const o = opts?.offset;
  if (o) p.add(new THREE.Vector3(o[0], o[1], o[2]));
  geo.translate(p.x, p.y, p.z);
  return skinRigid(geo, BONE_INDEX[bone]);
}

/** Merge skinned parts into ONE geometry (single material group). */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 1) return parts[0]!;
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("char: failed to merge skinned parts (attribute mismatch)");
  for (const p of parts) p.dispose();
  return merged;
}
