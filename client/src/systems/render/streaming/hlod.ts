// Hierarchical LOD far ring: aggregate every proxy chunk's silhouette blocks into ONE
// InstancedMesh so the whole distant skyline costs a single draw call. Rebuilt only when the
// resident center chunk changes (cheap: rewrite the instance matrices, adjust count). This masks
// far unload/pop-in together with exponential fog + camera.far tuned to the HLOD horizon.
import * as THREE from "three";
import type { BuildingDesc } from "./manifest";
import { MaterialLibrary, PROXY_BOX } from "./assets";

const hPos = new THREE.Vector3();
const hScale = new THREE.Vector3();
const hQuat = new THREE.Quaternion();
const hEuler = new THREE.Euler();
const hMat = new THREE.Matrix4();

export class HLOD {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;

  constructor(lib: MaterialLibrary, capacity = 512) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(PROXY_BOX, lib.get("concrete"), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.name = "stream:hlod";
    this.root.name = "stream:hlod-root";
    this.root.add(this.mesh);
  }

  /** Replace the entire far-ring proxy set. `proxies` are the aggregate blocks of all HLOD chunks. */
  rebuild(proxies: BuildingDesc[]): void {
    let i = 0;
    for (const b of proxies) {
      if (i >= this.capacity) break;
      const h = Math.max(1, b.height);
      const [w, d] = b.size;
      hPos.set(b.pos[0], h * 0.5, b.pos[2]);
      hScale.set(w, h, d);
      hQuat.setFromEuler(hEuler.set(0, b.rotY ?? 0, 0));
      this.mesh.setMatrixAt(i, hMat.compose(hPos, hQuat, hScale));
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get blockCount(): number {
    return this.mesh.count;
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
