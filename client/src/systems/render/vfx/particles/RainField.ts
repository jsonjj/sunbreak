// Baseline weather rain: a single camera-following InstancedMesh of streak quads, recycled
// with a wrap-around box so density scales with intensity at a FIXED draw cost. Offsets are
// stored relative to the camera, so the field always surrounds the player as they move. Wind
// advects + tilts the streaks. Count is driven by weather intensity × governor quality.
import * as THREE from "three";
import type { WeatherState } from "../types";

const _camPos = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _mat = new THREE.Matrix4();

export class RainField {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;

  private readonly ox: Float32Array;
  private readonly oy: Float32Array;
  private readonly oz: Float32Array;
  private readonly len: Float32Array;

  private readonly halfX = 20;
  private readonly halfZ = 20;
  private readonly halfY = 14;

  private active = 0;

  constructor(capacity: number, texture: THREE.Texture, renderOrder = 8) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(0.045, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.32,
      color: new THREE.Color(0.72, 0.78, 0.9),
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh = mesh;

    this.ox = new Float32Array(capacity);
    this.oy = new Float32Array(capacity);
    this.oz = new Float32Array(capacity);
    this.len = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.ox[i] = (Math.random() * 2 - 1) * this.halfX;
      this.oy[i] = (Math.random() * 2 - 1) * this.halfY;
      this.oz[i] = (Math.random() * 2 - 1) * this.halfZ;
      this.len[i] = 0.5 + Math.random() * 0.7;
    }
  }

  get live(): number {
    return this.active;
  }

  /** Step the rain. `quality` (0..1) from the governor sheds density under load. Returns the
   *  number of live streaks. When intensity is ~0 the mesh draws nothing. */
  update(
    dt: number,
    camera: THREE.Camera,
    weather: WeatherState,
    quality: number,
    maxActive: number,
  ): number {
    const rain = weather.rain <= 0 ? 0 : weather.rain > 1 ? 1 : weather.rain;
    const cat = weather.cat ?? 0;
    const ceiling = Math.min(this.capacity, maxActive < 0 ? 0 : maxActive);
    const target = Math.floor(ceiling * rain * (0.5 + 0.5 * quality));
    this.active = target > ceiling ? ceiling : target;
    if (this.active <= 0) {
      this.mesh.count = 0;
      return 0;
    }

    camera.getWorldPosition(_camPos);
    const windX = weather.wind.x;
    const windZ = weather.wind.z;
    const windMag = Math.hypot(windX, windZ);
    // Base fall speed rises with storm category.
    const fall = 14 + cat * 3;
    const sizeX = this.halfX * 2;
    const sizeZ = this.halfZ * 2;
    const sizeY = this.halfY * 2;
    const tilt = Math.max(-0.6, Math.min(0.6, windMag * 0.03));
    const lenScale = 1 + cat * 0.25;

    for (let i = 0; i < this.active; i++) {
      let ox = this.ox[i]! + windX * dt;
      let oy = this.oy[i]! - fall * dt;
      let oz = this.oz[i]! + windZ * dt;
      if (oy < -this.halfY) oy += sizeY;
      if (ox > this.halfX) ox -= sizeX;
      else if (ox < -this.halfX) ox += sizeX;
      if (oz > this.halfZ) oz -= sizeZ;
      else if (oz < -this.halfZ) oz += sizeZ;
      this.ox[i] = ox;
      this.oy[i] = oy;
      this.oz[i] = oz;

      const wx = _camPos.x + ox;
      const wy = _camPos.y + oy;
      const wz = _camPos.z + oz;
      const yaw = Math.atan2(_camPos.x - wx, _camPos.z - wz);
      _euler.set(tilt, yaw, 0);
      _quat.setFromEuler(_euler);
      _pos.set(wx, wy, wz);
      _scale.set(1, this.len[i]! * lenScale, 1);
      _mat.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(i, _mat);
    }
    this.mesh.count = this.active;
    this.mesh.instanceMatrix.needsUpdate = true;
    return this.active;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
