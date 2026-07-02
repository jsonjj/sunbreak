// InstancedMesh rendering for peds — ONE draw call per archetype. The InstancedMeshes live in a
// module-singleton THREE.Group that is shown either (a) by the ECS↔R3F bridge (we put the group
// on an entity's `three` view component — see index.ts) or (b) by the mountable <PedInstances/>
// component. Either way, per-instance matrices are written every render tick by `writeInstances()`.
//
// Animation is a procedural "VAT stand-in": a per-instance walk-cycle bob + lean driven by
// `animPhase`/`speed` (the plan's approved fallback for hundreds of instances without CPU
// skinning). Swapping in a real VAT shader later only touches this file.

import * as THREE from "three";
import { PedArchetype } from "@sunbreak/shared";
import { ARCHETYPES, PED_HALF_HEIGHT, PED_HARD_CAP, PED_RADIUS } from "../config";
import { pedQuery } from "../queries";

interface ArchMesh {
  mesh: THREE.InstancedMesh;
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
const meshes = new Map<PedArchetype, ArchMesh>();

// Scratch — zero per-frame allocation.
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _color = new THREE.Color();

// Low-poly capsule body — a dependency-free placeholder crowd figure (matches the v0 player
// capsule). Isolated here so swapping in a CC0 low-poly human / VAT mesh later is a one-function
// change. Shared across all archetype meshes (per-instance colour differentiates them).
function buildBodyGeometry(): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(PED_RADIUS, PED_HALF_HEIGHT * 2, 6, 12);
}

/** Build the InstancedMesh group once. Idempotent — returns the existing group on repeat calls. */
export function buildRenderRoot(): THREE.Group {
  if (root) return root;
  root = new THREE.Group();
  root.name = "ped-instances";
  const geo = buildBodyGeometry();

  for (const arch of ARCHETYPE_ORDER) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });
    const mesh = new THREE.InstancedMesh(geo, mat, PED_HARD_CAP);
    mesh.name = `peds-${arch}`;
    mesh.frustumCulled = false; // peds span the map; per-mesh sphere cull would misfire
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = PED_HARD_CAP;
    for (let i = 0; i < PED_HARD_CAP; i++) mesh.setMatrixAt(i, _zero); // all hidden initially
    mesh.instanceMatrix.needsUpdate = true;

    const free: number[] = [];
    for (let i = PED_HARD_CAP - 1; i >= 0; i--) free.push(i); // low indices popped first
    meshes.set(arch, { mesh, free, dirtyMatrix: false, dirtyColor: false });
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
  return m.free.pop() ?? -1;
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

/** Set an instance's colour (called on spawn, with per-instance jitter). */
export function setInstanceColor(arch: PedArchetype, slot: number, hex: number): void {
  const m = meshes.get(arch);
  if (!m || slot < 0) return;
  _color.setHex(hex);
  m.mesh.setColorAt(slot, _color);
  m.dirtyColor = true;
}

/**
 * Write instance matrices for all live peds from their `transform` + procedural walk anim.
 * Call once per render tick (the ped render-phase system does this).
 */
export function writeInstances(): void {
  if (!root) return;
  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state === "dead" || a.slot < 0) continue;
    const m = meshes.get(a.archetype);
    if (!m) continue;
    const t = e.transform!;

    // Procedural anim: vertical bob + slight roll sway + forward lean when running.
    const moving = a.speed;
    const cycle = a.animPhase * Math.PI * 2;
    const bob = Math.sin(cycle * 2) * 0.045 * Math.min(1, moving / 1.4);
    const sway = Math.sin(cycle) * 0.05 * Math.min(1, moving / 1.4);
    const lean = Math.min(0.22, moving * 0.03); // forward pitch, capped

    _pos.set(t.position.x, t.position.y + bob, t.position.z);
    _euler.set(lean, a.heading, sway, "YXZ");
    _quat.setFromEuler(_euler);
    _mat.compose(_pos, _quat, _scale);
    m.mesh.setMatrixAt(a.slot, _mat);
    m.dirtyMatrix = true;
  }

  for (const m of meshes.values()) {
    if (m.dirtyMatrix) {
      m.mesh.instanceMatrix.needsUpdate = true;
      m.dirtyMatrix = false;
    }
    if (m.dirtyColor && m.mesh.instanceColor) {
      m.mesh.instanceColor.needsUpdate = true;
      m.dirtyColor = false;
    }
  }
}

/** Colour for a freshly spawned ped: archetype base with a subtle per-instance value jitter. */
export function jitterColor(arch: PedArchetype, rng: () => number): number {
  _color.setHex(ARCHETYPES[arch].color);
  const j = 0.86 + rng() * 0.28;
  _color.multiplyScalar(j);
  return _color.getHex();
}

/** Dispose GPU resources (cleanup). */
export function disposeRenderRoot(): void {
  if (!root) return;
  for (const m of meshes.values()) {
    m.mesh.geometry.dispose();
    (m.mesh.material as THREE.Material).dispose();
    m.mesh.dispose();
  }
  meshes.clear();
  root = null;
}
