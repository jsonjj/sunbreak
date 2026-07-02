// Procedural, self-hostable geometry + a shared material library for the streaming subsystem.
//
// No baked .glb assets exist yet (they live under /assets, outside this folder and owned by the
// World-Art subsystem), so v1 builds placeholder city geometry procedurally from the chunk
// descriptors. Everything a chunk needs is either (a) a shared singleton (materials, prop/hero/
// proxy geometry — created once, disposed only at engine teardown) or (b) a per-chunk MERGED
// geometry (disposed on unload). This is the "merge static by material + share materials +
// dispose geometry on unload, refcount materials" budget rule, minus real assets.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingDesc, PropType, RoadSegment } from "./manifest";

export type MatKey =
  | "concrete"
  | "brick"
  | "glass"
  | "road"
  | "sidewalk"
  | "metal"
  | "foliage"
  | "wood"
  | "hydrant"
  | "plastic";

// ── Shared singletons (never cloned per chunk) ──────────────────────────────────────────────
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// Module-scope scratch — zero per-call allocation.
const mPos = new THREE.Vector3();
const mScale = new THREE.Vector3();
const mQuat = new THREE.Quaternion();
const mEuler = new THREE.Euler();
const mMat = new THREE.Matrix4();

function boxMatrix(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rotY = 0,
): THREE.Matrix4 {
  mPos.set(x, y, z);
  mScale.set(sx, sy, sz);
  mQuat.setFromEuler(mEuler.set(0, rotY, 0));
  return mMat.compose(mPos, mQuat, mScale);
}

/** A transformed unit-box clone ready to be merged. Caller owns disposal via mergeGeometries. */
function boxClone(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rotY = 0,
): THREE.BufferGeometry {
  return UNIT_BOX.clone().applyMatrix4(boxMatrix(x, y, z, sx, sy, sz, rotY));
}

// ── Material library (shared, refcount-free: singletons alive for the engine lifetime) ───────
export class MaterialLibrary {
  readonly mats: Record<MatKey, THREE.MeshStandardMaterial>;

  constructor() {
    const make = (color: number, roughness: number, metalness: number) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.mats = {
      concrete: make(0x8a8f99, 0.92, 0.02),
      brick: make(0x9c6b52, 0.88, 0.02),
      glass: make(0x6b8fb0, 0.25, 0.15),
      road: make(0x2b2f36, 0.96, 0.0),
      sidewalk: make(0x555f6b, 0.95, 0.0),
      metal: make(0x3a3f47, 0.5, 0.7),
      foliage: make(0x3f7d4a, 0.9, 0.0),
      wood: make(0x7a5a3a, 0.85, 0.0),
      hydrant: make(0xb23a3a, 0.7, 0.1),
      plastic: make(0x35506b, 0.7, 0.05),
    };
  }

  get(key: MatKey): THREE.MeshStandardMaterial {
    return this.mats[key];
  }

  dispose(): void {
    for (const key of Object.keys(this.mats) as MatKey[]) this.mats[key].dispose();
  }
}

// ── Per-chunk static geometry (merged by material) ──────────────────────────────────────────
export interface ChunkStaticPart {
  materialKey: MatKey;
  geometry: THREE.BufferGeometry;
}

const ROAD_Y = 0.02;
const SIDEWALK_Y = 0.06;
const SIDEWALK_H = 0.12;

/** Merge a chunk's buildings + roads/sidewalks into one geometry PER material (few draw calls).
 *  Returned geometries are owned by the caller and disposed on chunk unload. */
export function buildChunkStatic(
  buildings: BuildingDesc[],
  roads: RoadSegment[],
): ChunkStaticPart[] {
  const byMat = new Map<MatKey, THREE.BufferGeometry[]>();
  const push = (key: MatKey, geo: THREE.BufferGeometry) => {
    const arr = byMat.get(key);
    if (arr) arr.push(geo);
    else byMat.set(key, [geo]);
  };

  for (const b of buildings) {
    const [w, d] = b.size;
    const h = Math.max(1, b.height);
    push(b.material ?? "concrete", boxClone(b.pos[0], h * 0.5, b.pos[2], w, h, d, b.rotY ?? 0));
  }

  for (const seg of roads) {
    const ax = seg.a[0];
    const az = seg.a[1];
    const bx = seg.b[0];
    const bz = seg.b[1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 0.001;
    const rotY = Math.atan2(dx, dz); // align box +Z with the segment
    const cx = (ax + bx) * 0.5;
    const cz = (az + bz) * 0.5;
    if (seg.kind === "sidewalk") {
      push("sidewalk", boxClone(cx, SIDEWALK_Y, cz, seg.width, SIDEWALK_H, len, rotY));
    } else {
      push("road", boxClone(cx, ROAD_Y, cz, seg.width, 0.04, len, rotY));
    }
  }

  const parts: ChunkStaticPart[] = [];
  for (const [materialKey, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    // mergeGeometries copies data; free the per-building clones it consumed.
    if (geos.length > 1) for (const g of geos) g.dispose();
    parts.push({ materialKey, geometry: merged });
  }
  return parts;
}

// ── Prop LOD models (shared; one InstancedMesh set per part per LOD) ─────────────────────────
export type LodIndex = 0 | 1 | 2; // 0 = hi, 1 = mid, 2 = low

export interface PropPart {
  materialKey: MatKey;
  /** [hi, mid, low] geometries, origin at the prop's ground point. */
  lods: [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
}

export interface PropModel {
  type: PropType;
  parts: PropPart[];
}

function mergeOwned(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0]!;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

function streetlight(): PropModel {
  const hi = mergeOwned([
    boxClone(0, 2.5, 0, 0.14, 5, 0.14),
    boxClone(0, 5, 0.5, 0.1, 0.1, 1.0),
    boxClone(0, 4.9, 1.0, 0.3, 0.18, 0.3),
  ]);
  const mid = mergeOwned([boxClone(0, 2.5, 0, 0.16, 5, 0.16), boxClone(0, 4.9, 0.6, 0.3, 0.2, 0.3)]);
  const low = boxClone(0, 2.5, 0, 0.24, 5, 0.24);
  return { type: "streetlight", parts: [{ materialKey: "metal", lods: [hi, mid, low] }] };
}

function tree(): PropModel {
  const trunkHi = new THREE.CylinderGeometry(0.18, 0.24, 2, 8).translate(0, 1, 0);
  const trunkMid = new THREE.CylinderGeometry(0.2, 0.24, 2, 6).translate(0, 1, 0);
  const trunkLow = boxClone(0, 1, 0, 0.4, 2, 0.4);
  const canopyHi = new THREE.IcosahedronGeometry(1.6, 1).translate(0, 3.2, 0);
  const canopyMid = new THREE.IcosahedronGeometry(1.6, 0).translate(0, 3.2, 0);
  const canopyLow = boxClone(0, 3.2, 0, 2.6, 2.6, 2.6);
  return {
    type: "tree",
    parts: [
      { materialKey: "wood", lods: [trunkHi, trunkMid, trunkLow] },
      { materialKey: "foliage", lods: [canopyHi, canopyMid, canopyLow] },
    ],
  };
}

function bench(): PropModel {
  const frameHi = mergeOwned([
    boxClone(-0.7, 0.25, 0, 0.1, 0.5, 0.5),
    boxClone(0.7, 0.25, 0, 0.1, 0.5, 0.5),
  ]);
  const frameMid = boxClone(0, 0.25, 0, 1.6, 0.5, 0.5);
  const frameLow = boxClone(0, 0.3, 0, 1.7, 0.6, 0.55);
  const seatHi = mergeOwned([
    boxClone(0, 0.5, 0, 1.6, 0.08, 0.5),
    boxClone(0, 0.85, -0.22, 1.6, 0.5, 0.08),
  ]);
  const seatMid = boxClone(0, 0.5, 0, 1.6, 0.1, 0.5);
  const seatLow = boxClone(0, 0.55, 0, 1.6, 0.12, 0.5);
  return {
    type: "bench",
    parts: [
      { materialKey: "metal", lods: [frameHi, frameMid, frameLow] },
      { materialKey: "wood", lods: [seatHi, seatMid, seatLow] },
    ],
  };
}

function hydrant(): PropModel {
  const hi = mergeOwned([
    new THREE.CylinderGeometry(0.16, 0.18, 0.7, 10).translate(0, 0.35, 0),
    new THREE.SphereGeometry(0.17, 10, 8).translate(0, 0.72, 0),
  ]);
  const mid = new THREE.CylinderGeometry(0.17, 0.18, 0.8, 6).translate(0, 0.4, 0);
  const low = boxClone(0, 0.4, 0, 0.34, 0.8, 0.34);
  return { type: "hydrant", parts: [{ materialKey: "hydrant", lods: [hi, mid, low] }] };
}

function trashcan(): PropModel {
  const hi = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 12).translate(0, 0.45, 0);
  const mid = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 7).translate(0, 0.45, 0);
  const low = boxClone(0, 0.45, 0, 0.52, 0.9, 0.52);
  return { type: "trashcan", parts: [{ materialKey: "plastic", lods: [hi, mid, low] }] };
}

function planter(): PropModel {
  const box = mergeOwned([
    boxClone(0, 0.3, 0, 1.2, 0.6, 1.2),
    boxClone(0, 0.75, 0, 1.0, 0.3, 1.0),
  ]);
  const mid = boxClone(0, 0.4, 0, 1.2, 0.8, 1.2);
  const low = boxClone(0, 0.4, 0, 1.2, 0.8, 1.2);
  return { type: "planter", parts: [{ materialKey: "concrete", lods: [box, mid, low] }] };
}

export function buildPropModels(): Record<PropType, PropModel> {
  return {
    streetlight: streetlight(),
    tree: tree(),
    bench: bench(),
    hydrant: hydrant(),
    trashcan: trashcan(),
    planter: planter(),
  };
}

/** Shared unit box for the HLOD instanced skyline (scaled per instance). Not disposed per use. */
export const PROXY_BOX = UNIT_BOX;

// ── Hero landmark LOD (one instance; manual distance LOD driven by anchor distance) ──────────
export interface HeroLODLevel {
  maxDist: number;
  parts: ChunkStaticPart[];
}

/** LOD tiers for a hero tower (e.g. Solaris Tower). Distances are LOD swap thresholds; the last
 *  level's maxDist is the distance-cull radius (beyond it the hero hides, leaving only HLOD). */
export function buildHeroLevels(height = 120): HeroLODLevel[] {
  const w = 22;
  const body = (segments: number): ChunkStaticPart[] => {
    const glass: THREE.BufferGeometry[] = [];
    const concrete: THREE.BufferGeometry[] = [];
    const tiers = Math.max(1, segments);
    let y = 0;
    let cw = w;
    for (let i = 0; i < tiers; i++) {
      const th = height / tiers;
      glass.push(boxClone(0, y + th * 0.5, 0, cw, th, cw));
      concrete.push(boxClone(0, y + th, 0, cw + 1.5, 1.2, cw + 1.5)); // slab lip
      y += th;
      cw *= 0.86;
    }
    concrete.push(boxClone(0, height + 6, 0, 1.2, 12, 1.2)); // antenna
    return [
      { materialKey: "glass", geometry: mergeOwned(glass) },
      { materialKey: "concrete", geometry: mergeOwned(concrete) },
    ];
  };
  const impostor: ChunkStaticPart[] = [
    { materialKey: "glass", geometry: boxClone(0, height * 0.5, 0, w * 0.8, height, w * 0.8) },
  ];
  return [
    { maxDist: 60, parts: body(6) },
    { maxDist: 160, parts: body(3) },
    { maxDist: 900, parts: impostor },
  ];
}
