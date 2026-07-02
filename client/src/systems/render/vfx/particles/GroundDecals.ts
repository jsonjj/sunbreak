// Pooled ground-decal ring buffer (skid/tire marks, scorch, blood pools). Flat instanced
// quads laid in the XZ plane, oriented by yaw, with per-instance alpha that fades over life.
// Hard-capped FIFO: a new segment overwrites the oldest slot, so memory + draw cost are fixed.
// Positions are written once at add-time; only the alpha attribute is re-uploaded each frame.
import * as THREE from "three";

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iRotSize; // x = yaw, y = length, z = width
  attribute float iAlpha;
  attribute vec3 iColor;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vA = iAlpha;
    vColor = iColor;
    float yaw = iRotSize.x;
    float len = iRotSize.y;
    float wid = iRotSize.z;
    vec3 local = vec3(position.x * wid, 0.0, position.y * len);
    float s = sin(yaw);
    float c = cos(yaw);
    vec3 rot = vec3(local.x * c - local.z * s, 0.0, local.x * s + local.z * c);
    vec3 world = iPos + rot;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float a = tex.a * vA;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class GroundDecals {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private cap: number;
  private head = 0;
  private filled = 0;

  private readonly baseA: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;

  private readonly iPos: Float32Array;
  private readonly iRotSize: Float32Array;
  private readonly iAlpha: Float32Array;
  private readonly iColor: Float32Array;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aRotSize: THREE.InstancedBufferAttribute;
  private readonly aAlpha: THREE.InstancedBufferAttribute;
  private readonly aColor: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(capacity: number, texture: THREE.Texture, renderOrder = 5) {
    this.capacity = capacity;
    this.cap = capacity;
    const n = capacity;
    this.baseA = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.iPos = new Float32Array(n * 3);
    this.iRotSize = new Float32Array(n * 3);
    this.iAlpha = new Float32Array(n);
    this.iColor = new Float32Array(n * 3);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(this.iPos, 3);
    this.aRotSize = new THREE.InstancedBufferAttribute(this.iRotSize, 3);
    this.aAlpha = new THREE.InstancedBufferAttribute(this.iAlpha, 1);
    this.aColor = new THREE.InstancedBufferAttribute(this.iColor, 3);
    this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", this.aPos);
    geo.setAttribute("iRotSize", this.aRotSize);
    geo.setAttribute("iAlpha", this.aAlpha);
    geo.setAttribute("iColor", this.aColor);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    this.material.toneMapped = false;
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -2;
    this.material.polygonOffsetUnits = -2;

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
  }

  get live(): number {
    return this.filled;
  }

  /** Tier-driven soft cap (≤ allocated capacity). */
  setSoftCap(n: number): void {
    this.cap = n < 1 ? 1 : n > this.capacity ? this.capacity : n;
    if (this.head >= this.cap) this.head = 0;
    if (this.filled > this.cap) this.filled = this.cap;
  }

  /** Add a decal segment. Overwrites the oldest slot once at capacity (FIFO). */
  add(
    x: number,
    y: number,
    z: number,
    yaw: number,
    length: number,
    width: number,
    alpha: number,
    life: number,
    r = 0.05,
    g = 0.05,
    b = 0.06,
  ): void {
    const i = this.head;
    const p3 = i * 3;
    this.iPos[p3] = x;
    this.iPos[p3 + 1] = y;
    this.iPos[p3 + 2] = z;
    this.iRotSize[p3] = yaw;
    this.iRotSize[p3 + 1] = length;
    this.iRotSize[p3 + 2] = width;
    this.iColor[p3] = r;
    this.iColor[p3 + 1] = g;
    this.iColor[p3 + 2] = b;
    this.baseA[i] = alpha;
    this.age[i] = 0;
    this.life[i] = life > 0.1 ? life : 0.1;
    this.iAlpha[i] = alpha;
    this.head = (i + 1) % this.cap;
    if (this.filled < this.cap) this.filled++;
    this.aPos.needsUpdate = true;
    this.aRotSize.needsUpdate = true;
    this.aColor.needsUpdate = true;
  }

  update(dt: number): number {
    for (let i = 0; i < this.filled; i++) {
      const a = this.age[i]! + dt;
      this.age[i] = a;
      const l = this.life[i]!;
      const k = 1 - a / l;
      this.iAlpha[i] = k > 0 ? this.baseA[i]! * k : 0;
    }
    this.geometry.instanceCount = this.filled;
    if (this.filled > 0) this.aAlpha.needsUpdate = true;
    return this.filled;
  }

  clear(): void {
    this.head = 0;
    this.filled = 0;
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
