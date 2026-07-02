// InstancedMesh rendering for peds — ONE draw call per archetype. Each archetype's InstancedMesh
// draws the shared low-poly HUMANOID (crowdMesh.ts): limbs are swung in the vertex shader from
// per-instance (phase, speed) attributes, and skin/top/bottom/hair colours + a hat toggle are
// per-instance attributes too, so a crowd of hundreds reads as varied, animated people at instanced
// cost. The group lives in a module-singleton THREE.Group shown by the ECS↔R3F bridge (we put it on
// an entity's `three` view component — see index.ts) or the mountable <PedInstances/>.
//
// Per-instance matrices (position + heading + a small bob/sway/lean + a body-build scale) are written
// every render tick by `writeInstances()`; the shader adds the actual stride on top.

import * as THREE from "three";
import { PedArchetype } from "@sunbreak/shared";
import { PED_CENTER_Y, PED_HARD_CAP } from "../config";
import { pedQuery } from "../queries";
import {
  buildCrowdGeometry,
  crowdUniforms,
  makeCrowdDepthMaterial,
  makeCrowdMaterial,
} from "./crowdMesh";

/** Ped ground speed (m/s) that maps to a full-amplitude shader stride. */
const CROWD_SPEED_REF = 3.6;

interface ArchMesh {
  mesh: THREE.InstancedMesh;
  colBody: THREE.InstancedBufferAttribute;
  colTop: THREE.InstancedBufferAttribute;
  colBottom: THREE.InstancedBufferAttribute;
  colHair: THREE.InstancedBufferAttribute;
  anim: THREE.InstancedBufferAttribute;
  free: number[];
  dirtyMatrix: boolean;
  dirtyColor: boolean;
}

const ARCHETYPE_ORDER: PedArchetype[] = [
  PedArchetype.Civilian,
  PedArchetype.Business,
  PedArchetype.Tourist,
  PedArchetype.Gangster,
  PedArchetype.Police,
];

let root: THREE.Group | null = null;
let sharedMaterial: THREE.MeshStandardMaterial | null = null;
let sharedDepthMaterial: THREE.MeshDepthMaterial | null = null;
const meshes = new Map<PedArchetype, ArchMesh>();

// Scratch — zero per-frame allocation.
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _color = new THREE.Color();

/** Per-instance appearance written on spawn. Colours are sRGB hex; converted to linear here so they
 *  match the material's linear pipeline. */
export interface CrowdAppearance {
  skin: number;
  top: number;
  bottom: number;
  hair: number;
  hasHat: boolean;
}

function instancedVec3(cap: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  a.setUsage(THREE.StaticDrawUsage);
  return a;
}

/** Build the InstancedMesh group once. Idempotent — returns the existing group on repeat calls. */
export function buildRenderRoot(): THREE.Group {
  if (root) return root;
  root = new THREE.Group();
  root.name = "ped-instances";
  sharedMaterial = makeCrowdMaterial();
  sharedDepthMaterial = makeCrowdDepthMaterial();

  for (const arch of ARCHETYPE_ORDER) {
    const geo = buildCrowdGeometry();
    const colBody = instancedVec3(PED_HARD_CAP);
    const colTop = instancedVec3(PED_HARD_CAP);
    const colBottom = instancedVec3(PED_HARD_CAP);
    const colHair = instancedVec3(PED_HARD_CAP);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(PED_HARD_CAP * 4), 4);
    anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iColBody", colBody);
    geo.setAttribute("iColTop", colTop);
    geo.setAttribute("iColBottom", colBottom);
    geo.setAttribute("iColHair", colHair);
    geo.setAttribute("iAnim", anim);

    const mesh = new THREE.InstancedMesh(geo, sharedMaterial, PED_HARD_CAP);
    mesh.name = `peds-${arch}`;
    mesh.frustumCulled = false; // peds span the map; per-mesh sphere cull would misfire
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = sharedDepthMaterial; // shadows follow the same procedural stride
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PED_HARD_CAP; i++) mesh.setMatrixAt(i, _zero); // all hidden initially
    mesh.instanceMatrix.needsUpdate = true;
    // Draw only up to the high-water slot (grown in allocSlot) so an empty district costs ~nothing.
    mesh.count = 0;

    const free: number[] = [];
    for (let i = PED_HARD_CAP - 1; i >= 0; i--) free.push(i); // low indices popped first
    meshes.set(arch, { mesh, colBody, colTop, colBottom, colHair, anim, free, dirtyMatrix: false, dirtyColor: false });
    root.add(mesh);
  }
  return root;
}

/** The ped InstancedMesh group (build it first via buildRenderRoot / init). */
export const getRenderRoot = (): THREE.Group | null => root;

/** Reserve an instance slot for an archetype. Returns −1 when that mesh is full. */
export function allocSlot(arch: PedArchetype): number {
  const m = meshes.get(arch);
  if (!m) return -1;
  const slot = m.free.pop() ?? -1;
  if (slot >= 0 && slot + 1 > m.mesh.count) m.mesh.count = slot + 1; // grow the drawn range
  return slot;
}

/** Hide a slot (zero-scale) without freeing it (used on death; ragdoll takes over visuals). */
export function hideSlot(arch: PedArchetype, slot: number): void {
  const m = meshes.get(arch);
  if (!m || slot < 0) return;
  m.mesh.setMatrixAt(slot, _zero);
  m.dirtyMatrix = true;
}

/** Free a slot back to the pool and hide it. */
export function freeSlot(arch: PedArchetype, slot: number): void {
  const m = meshes.get(arch);
  if (!m || slot < 0) return;
  hideSlot(arch, slot);
  m.free.push(slot);
}

function writeColor(attr: THREE.InstancedBufferAttribute, slot: number, hex: number): void {
  _color.setHex(hex).convertSRGBToLinear();
  const i = slot * 3;
  (attr.array as Float32Array)[i] = _color.r;
  (attr.array as Float32Array)[i + 1] = _color.g;
  (attr.array as Float32Array)[i + 2] = _color.b;
}

/** Set an instance's full appearance (skin/top/bottom/hair + hat flag). Called on spawn. */
export function setInstanceAppearance(arch: PedArchetype, slot: number, look: CrowdAppearance): void {
  const m = meshes.get(arch);
  if (!m || slot < 0) return;
  writeColor(m.colBody, slot, look.skin);
  writeColor(m.colTop, slot, look.top);
  writeColor(m.colBottom, slot, look.bottom);
  writeColor(m.colHair, slot, look.hair);
  const a = m.anim.array as Float32Array;
  a[slot * 4 + 2] = look.hasHat ? 1 : 0; // hat toggle lives in iAnim.z
  a[slot * 4 + 3] = Math.random(); // iAnim.w: per-instance idle phase (breathing/sway desync)
  m.colBody.needsUpdate = true;
  m.colTop.needsUpdate = true;
  m.colBottom.needsUpdate = true;
  m.colHair.needsUpdate = true;
  m.dirtyColor = true;
}

/**
 * Write instance matrices + per-instance anim for all live peds. Call once per render tick (the ped
 * render-phase system does this).
 */
export function writeInstances(): void {
  if (!root) return;
  crowdUniforms.uTime.value = performance.now() * 0.001; // advance the shared idle clock
  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state === "dead" || a.slot < 0) continue;
    const m = meshes.get(a.archetype);
    if (!m) continue;
    const t = e.transform!;

    // Whole-body motion baked into the matrix (the shader adds the limb stride on top).
    const moving = a.speed;
    const cycle = a.animPhase * Math.PI * 2;
    const bob = Math.sin(cycle * 2) * 0.03 * Math.min(1, moving / 1.4);
    const sway = Math.sin(cycle) * 0.04 * Math.min(1, moving / 1.4);
    const lean = Math.min(0.2, moving * 0.03); // forward pitch, capped

    // The humanoid mesh is feet-origin; the ped transform is capsule-centred, so drop by PED_CENTER_Y.
    _pos.set(t.position.x, t.position.y - PED_CENTER_Y + bob, t.position.z);
    // Model faces -Z; a.heading = atan2(vx,vz) points a -Z model AWAY from travel, so add π so the
    // figure (and thus its forward leg swing) leads the direction of motion — no reversed "moonwalk".
    _euler.set(lean, a.heading + Math.PI, sway, "YXZ");
    _quat.setFromEuler(_euler);
    _scale.set(a.bodyW, a.bodyH, a.bodyW);
    _mat.compose(_pos, _quat, _scale);
    m.mesh.setMatrixAt(a.slot, _mat);
    m.dirtyMatrix = true;

    const anim = m.anim.array as Float32Array;
    const i4 = a.slot * 4;
    anim[i4] = a.animPhase; // x: stride phase
    anim[i4 + 1] = Math.min(1, a.speed / CROWD_SPEED_REF); // y: speed 0..1 (swing amplitude)
    // z (hat flag) + w (idle desync phase) are set once on spawn and left intact here.
  }

  for (const m of meshes.values()) {
    if (m.dirtyMatrix) {
      // Matrix + anim are written together per live ped, so one flag gates both uploads; an archetype
      // with no live peds this frame uploads neither.
      m.mesh.instanceMatrix.needsUpdate = true;
      m.anim.needsUpdate = true;
      m.dirtyMatrix = false;
    }
    if (m.dirtyColor) m.dirtyColor = false;
  }
}

/** Dispose GPU resources (cleanup). */
export function disposeRenderRoot(): void {
  if (!root) return;
  for (const m of meshes.values()) {
    m.mesh.geometry.dispose();
    m.mesh.dispose();
  }
  sharedMaterial?.dispose();
  sharedDepthMaterial?.dispose();
  sharedMaterial = null;
  sharedDepthMaterial = null;
  meshes.clear();
  root = null;
}
