// Global InstancedMesh prop pools — one draw call per (prop-part, LOD) regardless of how many
// chunks are resident. This is the documented fallback for @three.ez/instanced-mesh
// (InstancedMesh2), which is NOT in the pre-installed dep set: we lose automatic per-instance
// frustum culling + dynamic BVH and instead do coarse per-chunk LOD (assign a chunk's props to
// hi/mid/low pools by its ring distance) with a free-list allocator + zero-scale holes. Pools
// are disposed only at engine teardown; per-chunk allocations are freed on unload.
import * as THREE from "three";
import type { PropPlacement, PropType } from "./manifest";
import { buildPropModels, MaterialLibrary, type LodIndex, type PropModel } from "./assets";

const PER_GROUP_CAP = 1024;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Scratch — zero per-instance allocation.
const sPos = new THREE.Vector3();
const sScale = new THREE.Vector3();
const sQuat = new THREE.Quaternion();
const sEuler = new THREE.Euler();
const sMat = new THREE.Matrix4();

function placementMatrix(p: PropPlacement): THREE.Matrix4 {
  const s = p.scale ?? 1;
  sPos.set(p.pos[0], p.pos[1], p.pos[2]);
  sScale.set(s, s, s);
  sQuat.setFromEuler(sEuler.set(0, p.rotY ?? 0, 0));
  return sMat.compose(sPos, sQuat, sScale);
}

/** One LOD level of one prop type: parallel InstancedMeshes (one per material part), sharing a
 *  single index space + free-list (parts always move together). */
class PropLodGroup {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly free: number[] = [];
  private usedMax = 0;

  constructor(model: PropModel, lod: LodIndex, lib: MaterialLibrary, capacity: number) {
    for (const part of model.parts) {
      const mesh = new THREE.InstancedMesh(part.lods[lod], lib.get(part.materialKey), capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Whole-pool frustum culling would wrongly cull the spread-out pool (its geometry bound is
      // at the origin); per-instance culling needs InstancedMesh2. Rely on ring/distance culling.
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `stream:prop:${model.type}:lod${lod}`;
      this.meshes.push(mesh);
    }
  }

  alloc(capacity: number): number {
    let idx = this.free.pop();
    if (idx === undefined) {
      if (this.usedMax >= capacity) return -1;
      idx = this.usedMax++;
      for (const m of this.meshes) m.count = this.usedMax;
    }
    return idx;
  }

  write(idx: number, m: THREE.Matrix4): void {
    for (const mesh of this.meshes) {
      mesh.setMatrixAt(idx, m);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  release(idx: number): void {
    for (const mesh of this.meshes) {
      mesh.setMatrixAt(idx, ZERO);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.free.push(idx);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
  }
}

interface ChunkAlloc {
  lod: LodIndex;
  placements: PropPlacement[];
  items: { type: PropType; idx: number }[];
}

export class InstancePools {
  readonly root = new THREE.Group();
  private readonly groups: Record<PropType, PropLodGroup[]>;
  private readonly chunks = new Map<string, ChunkAlloc>();
  private live = 0;

  constructor(
    private readonly lib: MaterialLibrary,
    private readonly cap: number,
  ) {
    this.root.name = "stream:props";
    const models = buildPropModels();
    this.groups = {} as Record<PropType, PropLodGroup[]>;
    for (const type of Object.keys(models) as PropType[]) {
      const lods: PropLodGroup[] = [0, 1, 2].map(
        (lod) => new PropLodGroup(models[type], lod as LodIndex, lib, PER_GROUP_CAP),
      );
      this.groups[type] = lods;
      for (const g of lods) for (const m of g.meshes) this.root.add(m);
    }
  }

  /** Allocate a chunk's props into the pools at a coarse LOD (0 hi / 1 mid / 2 low). */
  addForChunk(key: string, placements: PropPlacement[], lod: LodIndex): void {
    if (this.chunks.has(key)) return;
    const items: { type: PropType; idx: number }[] = [];
    for (const p of placements) {
      if (this.live >= this.cap) break; // respect the tier's total instance budget
      const group = this.groups[p.type]?.[lod];
      if (!group) continue;
      const idx = group.alloc(PER_GROUP_CAP);
      if (idx < 0) continue;
      group.write(idx, placementMatrix(p));
      items.push({ type: p.type, idx });
      this.live++;
    }
    this.chunks.set(key, { lod, placements, items });
  }

  /** Move a chunk's props to a different LOD band (free + re-add) when its ring distance changes. */
  setChunkLod(key: string, lod: LodIndex): void {
    const rec = this.chunks.get(key);
    if (!rec || rec.lod === lod) return;
    const placements = rec.placements;
    this.removeForChunk(key);
    this.addForChunk(key, placements, lod);
  }

  removeForChunk(key: string): void {
    const rec = this.chunks.get(key);
    if (!rec) return;
    for (const it of rec.items) {
      this.groups[it.type]?.[rec.lod]?.release(it.idx);
      this.live--;
    }
    this.chunks.delete(key);
  }

  get activeCount(): number {
    return this.live;
  }

  get drawCalls(): number {
    // One draw per instanced mesh that currently has visible instances.
    let n = 0;
    for (const type of Object.keys(this.groups) as PropType[]) {
      for (const g of this.groups[type]) for (const m of g.meshes) if (m.count > 0) n++;
    }
    return n;
  }

  dispose(): void {
    for (const type of Object.keys(this.groups) as PropType[]) {
      for (const g of this.groups[type]) g.dispose();
    }
    this.chunks.clear();
    this.live = 0;
  }
}
