// Custom instanced billboard core — ONE draw call per family, ZERO hot-path allocation.
//
// Particle state is Structure-of-Arrays in preallocated Float32Arrays, kept contiguous in
// [0, count) via swap-remove on death. Each frame the live slots are copied into three
// instanced attributes and drawn as camera-facing quads billboarded in the vertex shader
// (view-space offset — no per-particle matrices, no CPU lookAt). Used for flashes, fireballs,
// smoke, dust, exhaust, and impact puffs (additive vs. alpha variants).
import * as THREE from "three";

/** Mutable spawn descriptor. Reused by emitters (one scratch, mutated per particle) so
 *  spawning thousands of particles retains no garbage. */
export interface BillboardSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size0: number;
  size1: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  rot: number;
  rotVel: number;
  drag: number;
  gravity: number;
  fadeIn: number;
}

export function makeBillboardSpawn(): BillboardSpawn {
  return {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    life: 1,
    size0: 1, size1: 1,
    r: 1, g: 1, b: 1,
    alpha: 1,
    rot: 0, rotVel: 0,
    drag: 0, gravity: 0,
    fadeIn: 0.1,
  };
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iColor;
  attribute vec2 iMisc; // x = size, y = rotation
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = uv;
    vColor = iColor;
    float sz = iMisc.x;
    float rot = iMisc.y;
    float s = sin(rot);
    float c = cos(rot);
    vec2 corner = position.xy * sz;
    vec2 rc = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    mv.xy += rc;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float a = tex.a * vColor.a;
    #ifdef VFX_ADDITIVE
      gl_FragColor = vec4(vColor.rgb * a, a);
    #else
      gl_FragColor = vec4(vColor.rgb, a);
    #endif
    if (a < 0.003) discard;
  }
`;

export class Billboards {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private count = 0;
  private cap: number;

  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly sz0: Float32Array;
  private readonly sz1: Float32Array;
  private readonly cr: Float32Array;
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;
  private readonly al: Float32Array;
  private readonly rot: Float32Array;
  private readonly rvel: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly fin: Float32Array;

  private readonly iPos: Float32Array;
  private readonly iColor: Float32Array;
  private readonly iMisc: Float32Array;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(capacity: number, texture: THREE.Texture, additive: boolean, renderOrder = 10) {
    this.capacity = capacity;
    this.cap = capacity;
    const n = capacity;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.sz0 = new Float32Array(n);
    this.sz1 = new Float32Array(n);
    this.cr = new Float32Array(n);
    this.cg = new Float32Array(n);
    this.cb = new Float32Array(n);
    this.al = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.rvel = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.fin = new Float32Array(n);

    this.iPos = new Float32Array(n * 3);
    this.iColor = new Float32Array(n * 4);
    this.iMisc = new Float32Array(n * 2);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(this.iPos, 3);
    this.aColor = new THREE.InstancedBufferAttribute(this.iColor, 4);
    this.aMisc = new THREE.InstancedBufferAttribute(this.iMisc, 2);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aColor.setUsage(THREE.DynamicDrawUsage);
    this.aMisc.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", this.aPos);
    geo.setAttribute("iColor", this.aColor);
    geo.setAttribute("iMisc", this.aMisc);
    geo.instanceCount = 0;
    // Particles roam far beyond the base quad — never frustum-cull the batch.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { VFX_ADDITIVE: "" } : {},
    });
    this.material.toneMapped = false;

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
  }

  get live(): number {
    return this.count;
  }

  get room(): number {
    return this.cap - this.count;
  }

  /** Tier-driven soft cap (≤ allocated capacity). Live particles above it simply drain out. */
  setSoftCap(n: number): void {
    this.cap = n < 0 ? 0 : n > this.capacity ? this.capacity : n;
  }

  /** Copy a spawn descriptor into a free slot. Returns false when at capacity (budget shed). */
  spawn(p: BillboardSpawn): boolean {
    if (this.count >= this.cap) return false;
    const i = this.count++;
    this.px[i] = p.x;
    this.py[i] = p.y;
    this.pz[i] = p.z;
    this.vx[i] = p.vx;
    this.vy[i] = p.vy;
    this.vz[i] = p.vz;
    this.age[i] = 0;
    this.life[i] = p.life > 0.001 ? p.life : 0.001;
    this.sz0[i] = p.size0;
    this.sz1[i] = p.size1;
    this.cr[i] = p.r;
    this.cg[i] = p.g;
    this.cb[i] = p.b;
    this.al[i] = p.alpha;
    this.rot[i] = p.rot;
    this.rvel[i] = p.rotVel;
    this.drag[i] = p.drag;
    this.grav[i] = p.gravity;
    this.fin[i] = p.fadeIn > 0 ? p.fadeIn : 0.0001;
    return true;
  }

  private removeSwap(i: number): void {
    const last = this.count - 1;
    if (i !== last) {
      this.px[i] = this.px[last]!;
      this.py[i] = this.py[last]!;
      this.pz[i] = this.pz[last]!;
      this.vx[i] = this.vx[last]!;
      this.vy[i] = this.vy[last]!;
      this.vz[i] = this.vz[last]!;
      this.age[i] = this.age[last]!;
      this.life[i] = this.life[last]!;
      this.sz0[i] = this.sz0[last]!;
      this.sz1[i] = this.sz1[last]!;
      this.cr[i] = this.cr[last]!;
      this.cg[i] = this.cg[last]!;
      this.cb[i] = this.cb[last]!;
      this.al[i] = this.al[last]!;
      this.rot[i] = this.rot[last]!;
      this.rvel[i] = this.rvel[last]!;
      this.drag[i] = this.drag[last]!;
      this.grav[i] = this.grav[last]!;
      this.fin[i] = this.fin[last]!;
    }
    this.count = last;
  }

  /** Integrate all live particles, recycle the dead, and upload instanced attributes.
   *  Returns the number of live particles (for budget accounting). */
  update(dt: number): number {
    let i = 0;
    while (i < this.count) {
      const a = this.age[i]! + dt;
      const l = this.life[i]!;
      if (a >= l) {
        this.removeSwap(i);
        continue;
      }
      this.age[i] = a;
      const damp = Math.exp(-this.drag[i]! * dt);
      let vx = this.vx[i]! * damp;
      let vy = this.vy[i]! * damp + this.grav[i]! * dt;
      let vz = this.vz[i]! * damp;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      const nx = this.px[i]! + vx * dt;
      const ny = this.py[i]! + vy * dt;
      const nz = this.pz[i]! + vz * dt;
      this.px[i] = nx;
      this.py[i] = ny;
      this.pz[i] = nz;
      const nr = this.rot[i]! + this.rvel[i]! * dt;
      this.rot[i] = nr;

      const t = a / l;
      const fi = this.fin[i]!;
      const brightness =
        this.al[i]! * (t < fi ? t / fi : 1 - (t - fi) / (1 - fi));
      const size = this.sz0[i]! + (this.sz1[i]! - this.sz0[i]!) * t;

      const p3 = i * 3;
      this.iPos[p3] = nx;
      this.iPos[p3 + 1] = ny;
      this.iPos[p3 + 2] = nz;
      const c4 = i * 4;
      this.iColor[c4] = this.cr[i]!;
      this.iColor[c4 + 1] = this.cg[i]!;
      this.iColor[c4 + 2] = this.cb[i]!;
      this.iColor[c4 + 3] = brightness > 0 ? brightness : 0;
      const m2 = i * 2;
      this.iMisc[m2] = size;
      this.iMisc[m2 + 1] = nr;
      i++;
    }

    this.geometry.instanceCount = this.count;
    if (this.count > 0) {
      this.aPos.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aMisc.needsUpdate = true;
    }
    return this.count;
  }

  clear(): void {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
