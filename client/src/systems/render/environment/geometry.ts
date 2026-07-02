// Low-poly procedural geometry for foliage + props. No glTF assets (none ship with this
// subsystem); Draco/meshopt glTF loading is a v4 pipeline upgrade noted in the report. Each
// maker returns a single (merged) BufferGeometry ready to instance.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash2 } from "./noise";

/** Bake a flat vertex colour onto every vertex so merged parts keep their tint under one material. */
function withColor(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Make a single part safe to feed to `mergeGeometries()`. That helper rejects the whole batch
 * unless EVERY geometry is uniformly indexed (or uniformly non-indexed) AND exposes the exact same
 * set of attribute names. Three's polyhedra (Icosahedron/Octahedron/…) come back NON-indexed while
 * its cylinders/cones/planes/spheres are indexed — so mixing them (e.g. the mangrove's icosahedron
 * canopy with its cylinder trunk) trips the "index attribute exists among all geometries, or in none
 * of them" error. We flatten every part to non-indexed and backfill any missing normal/uv so the
 * whole batch shares one attribute layout. Normals/UVs are only computed when absent (three's
 * primitives already supply them; transforms keep them correct).
 */
function normalizeForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position!.count;
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

/**
 * Merge low-poly parts into one instance-ready geometry. Each part is normalized first so the merge
 * can never fail on mismatched index/attribute layouts. If any part carries vertex colours we ensure
 * they all do (white default) so the attribute sets stay identical. Part normals are preserved (no
 * global recompute) so previously-working species keep their smooth shading.
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map(normalizeForMerge);
  if (normalized.some((g) => g.attributes.color)) {
    for (const g of normalized) {
      if (g.attributes.color) continue;
      const count = g.attributes.position!.count;
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    }
  }
  const g = mergeGeometries(normalized, false);
  if (!g) throw new Error("env: geometry merge failed");
  g.computeBoundingSphere();
  return g;
}

// ---- Foliage ----------------------------------------------------------------------------

/** Crossed alpha-tested quads for grass / sawgrass (uses a blade texture as the material map). */
export function makeGrassClump(width: number, height: number, crosses = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < crosses; i++) {
    const p = new THREE.PlaneGeometry(width, height, 1, 1);
    p.translate(0, height / 2, 0);
    p.rotateY((i / crosses) * Math.PI);
    parts.push(p);
  }
  const g = mergeGeometries(parts.map(normalizeForMerge), false);
  if (!g) throw new Error("env: grass merge failed");
  g.computeBoundingSphere();
  return g;
}

export function makePalm(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 6.5;
  const trunk = new THREE.CylinderGeometry(0.14, 0.28, trunkH, 6, 2, true);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(withColor(trunk, 0x6b4f2a));

  const frondLen = 3.4;
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const f = new THREE.ConeGeometry(0.5, frondLen, 4, 1);
    f.translate(0, frondLen / 2, 0);
    f.scale(1, 1, 0.18);
    f.rotateX(1.15);
    f.rotateY((i / fronds) * Math.PI * 2);
    f.translate(0, trunkH, 0);
    parts.push(withColor(f, i % 2 ? 0x3f6d2b : 0x4f7d33));
  }
  return merge(parts);
}

export function makeCypress(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 5;
  const trunk = new THREE.CylinderGeometry(0.14, 0.34, trunkH, 6, 1, true);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(withColor(trunk, 0x5a4630));

  const c1 = new THREE.ConeGeometry(2.0, 5.5, 7, 1);
  c1.translate(0, trunkH + 2.0, 0);
  parts.push(withColor(c1, 0x33502a));
  const c2 = new THREE.ConeGeometry(1.3, 4.0, 7, 1);
  c2.translate(0, trunkH + 4.6, 0);
  parts.push(withColor(c2, 0x3c5c30));
  return merge(parts);
}

export function makeMangrove(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 2.6;
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, trunkH, 6, 1, true);
  trunk.translate(0, trunkH / 2 + 0.6, 0);
  parts.push(withColor(trunk, 0x5b4326));

  const canopy = new THREE.IcosahedronGeometry(2.1, 1);
  canopy.scale(1.2, 0.8, 1.2);
  canopy.translate(0, trunkH + 1.4, 0);
  parts.push(withColor(canopy, 0x3d5f34));

  const roots = 5;
  for (let i = 0; i < roots; i++) {
    const r = new THREE.CylinderGeometry(0.06, 0.1, 1.8, 4, 1, true);
    r.translate(0, 0.9, 0);
    r.rotateX(0.6);
    r.rotateY((i / roots) * Math.PI * 2);
    r.translate(0, 0.1, 0);
    parts.push(withColor(r, 0x4b3a22));
  }
  return merge(parts);
}

// ---- Props ------------------------------------------------------------------------------

/** Irregular boulder (deterministically jittered icosahedron). */
export function makeRock(seed = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const j = 0.72 + 0.5 * hash2(i, seed, 4201);
    pos.setXYZ(
      i,
      pos.getX(i) * j,
      pos.getY(i) * (0.6 + 0.4 * hash2(i, seed, 4211)),
      pos.getZ(i) * j,
    );
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeDriftwood(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.12, 0.17, 1.7, 6, 1);
  g.rotateZ(Math.PI / 2);
  g.rotateY(0.4);
  g.translate(0, 0.16, 0);
  g.computeBoundingSphere();
  return g;
}

export function makePiling(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.22, 0.26, 3.2, 8, 1);
  g.translate(0, 1.6, 0);
  g.computeBoundingSphere();
  return g;
}

export function makeBuoy(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.SphereGeometry(0.4, 10, 8);
  body.translate(0, 0.3, 0);
  parts.push(withColor(body, 0xc7402f));
  const top = new THREE.ConeGeometry(0.28, 0.6, 8, 1);
  top.translate(0, 0.9, 0);
  parts.push(withColor(top, 0xe8a13a));
  return merge(parts);
}

export function makeUmbrella(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6, 1);
  pole.translate(0, 1.15, 0);
  parts.push(withColor(pole, 0x8a8f99));
  const canopy = new THREE.ConeGeometry(1.5, 0.75, 12, 1);
  canopy.translate(0, 2.4, 0);
  parts.push(withColor(canopy, 0xdb5a52));
  return merge(parts);
}
