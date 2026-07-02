// Pooled short-lived dynamic lights for muzzle flashes + explosions. Lights are reused via the
// generic Pool and, once created, stay parented to the group (never removed) so the scene's
// light COUNT is stable — this avoids per-flash material recompiles. Tier cap gates how many
// may be lit at once (LOW = 0 → no lights are ever created).
import * as THREE from "three";
import { Pool } from "./pool";

interface LiveLight {
  light: THREE.PointLight;
  age: number;
  life: number;
  peak: number;
}

export class LightPool {
  readonly group = new THREE.Group();
  private readonly pool: Pool<THREE.PointLight>;
  private readonly entries: LiveLight[] = [];
  private max: number;

  constructor(max: number, hardMax = 4) {
    this.max = max;
    this.pool = new Pool<THREE.PointLight>(
      () => {
        const l = new THREE.PointLight(0xffffff, 0, 10, 2);
        l.castShadow = false;
        return l;
      },
      (l) => {
        l.intensity = 0;
      },
      0,
      hardMax,
    );
    this.group.name = "vfx-lights";
  }

  get live(): number {
    return this.entries.length;
  }

  setMax(m: number): void {
    this.max = m;
  }

  /** Light a pooled flash. No-op past the tier cap or when the pool is exhausted. */
  flash(
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
    life: number,
  ): void {
    if (this.max <= 0 || this.entries.length >= this.max) return;
    const l = this.pool.acquire();
    if (!l) return;
    if (l.parent !== this.group) this.group.add(l);
    l.color.setHex(color);
    l.distance = distance;
    l.decay = 2;
    l.position.set(x, y, z);
    l.intensity = intensity;
    this.entries.push({ light: l, age: 0, life: life > 0.01 ? life : 0.01, peak: intensity });
  }

  update(dt: number): number {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      e.age += dt;
      const t = e.age / e.life;
      if (t >= 1) {
        this.pool.release(e.light);
        this.entries.splice(i, 1);
        continue;
      }
      e.light.intensity = e.peak * (1 - t);
    }
    return this.entries.length;
  }

  dispose(): void {
    for (const e of this.entries) this.pool.release(e.light);
    this.entries.length = 0;
    this.group.clear();
  }
}
