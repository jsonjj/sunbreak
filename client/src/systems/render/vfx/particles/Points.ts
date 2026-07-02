// Cheapest particle path: gl.POINTS with per-point size + color via a tiny custom shader.
// Used for sparks, embers, debris sparkle, splash droplets. Additive, size-attenuated,
// single draw call, SoA typed-array state with swap-remove (mirrors Billboards).
import * as THREE from "three";

export interface PointSpawn {
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
  drag: number;
  gravity: number;
}

export function makePointSpawn(): PointSpawn {
  return {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    life: 1,
    size0: 1, size1: 1,
    r: 1, g: 1, b: 1,
    alpha: 1,
    drag: 0, gravity: 0,
  };
}

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  uniform float uHeightScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = clamp(aSize * uHeightScale / max(d, 0.001), 1.0, 96.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  varying vec4 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vColor.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb * a, a);
  }
`;

export class Points {
  readonly points: THREE.Points;
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
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;

  private readonly posArr: Float32Array;
  private readonly colArr: Float32Array;
  private readonly sizeArr: Float32Array;
  private readonly aPosition: THREE.BufferAttribute;
  private readonly aColor: THREE.BufferAttribute;
  private readonly aSize: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(capacity: number, texture: THREE.Texture, renderOrder = 11) {
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
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);

    this.posArr = new Float32Array(n * 3);
    this.colArr = new Float32Array(n * 4);
    this.sizeArr = new Float32Array(n);

    const geo = new THREE.BufferGeometry();
    this.aPosition = new THREE.BufferAttribute(this.posArr, 3);
    this.aColor = new THREE.BufferAttribute(this.colArr, 4);
    this.aSize = new THREE.BufferAttribute(this.sizeArr, 1);
    this.aPosition.setUsage(THREE.DynamicDrawUsage);
    this.aColor.setUsage(THREE.DynamicDrawUsage);
    this.aSize.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.aPosition);
    geo.setAttribute("aColor", this.aColor);
    geo.setAttribute("aSize", this.aSize);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    geo.setDrawRange(0, 0);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uHeightScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.material.toneMapped = false;

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.matrixAutoUpdate = false;
  }

  get live(): number {
    return this.count;
  }

  get room(): number {
    return this.cap - this.count;
  }

  /** Tier-driven soft cap (≤ allocated capacity). */
  setSoftCap(n: number): void {
    this.cap = n < 0 ? 0 : n > this.capacity ? this.capacity : n;
  }

  /** Feed the drawing-buffer height so size attenuation matches the viewport. */
  setHeightScale(px: number): void {
    this.material.uniforms.uHeightScale!.value = px * 0.5;
  }

  spawn(p: PointSpawn): boolean {
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
    this.drag[i] = p.drag;
    this.grav[i] = p.gravity;
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
      this.drag[i] = this.drag[last]!;
      this.grav[i] = this.grav[last]!;
    }
    this.count = last;
  }

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
      const vx = this.vx[i]! * damp;
      const vy = this.vy[i]! * damp + this.grav[i]! * dt;
      const vz = this.vz[i]! * damp;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      const nx = this.px[i]! + vx * dt;
      const ny = this.py[i]! + vy * dt;
      const nz = this.pz[i]! + vz * dt;
      this.px[i] = nx;
      this.py[i] = ny;
      this.pz[i] = nz;

      const t = a / l;
      const brightness = this.al[i]! * (1 - t) * (t < 0.1 ? t / 0.1 : 1);
      const size = this.sz0[i]! + (this.sz1[i]! - this.sz0[i]!) * t;

      const p3 = i * 3;
      this.posArr[p3] = nx;
      this.posArr[p3 + 1] = ny;
      this.posArr[p3 + 2] = nz;
      const c4 = i * 4;
      this.colArr[c4] = this.cr[i]!;
      this.colArr[c4 + 1] = this.cg[i]!;
      this.colArr[c4 + 2] = this.cb[i]!;
      this.colArr[c4 + 3] = brightness > 0 ? brightness : 0;
      this.sizeArr[i] = size > 0 ? size : 0;
      i++;
    }

    this.geometry.setDrawRange(0, this.count);
    if (this.count > 0) {
      this.aPosition.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aSize.needsUpdate = true;
    }
    return this.count;
  }

  clear(): void {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
