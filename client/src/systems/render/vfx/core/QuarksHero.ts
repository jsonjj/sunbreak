// Authored HERO explosions via three.quarks (maintained, batched single-draw). This is the
// only place quarks is used — the custom instanced core (../particles/*) covers everything
// else, so quarks stays swappable and any failure here is caught and degrades gracefully.
//
// Each explosion spawns two short-lived batched systems (additive fireball + alpha smoke).
// Cleanup is driven by our own timer so we never depend on quarks' internal auto-destroy.
import * as THREE from "three";
import {
  ApplyForce,
  BatchedRenderer,
  Bezier,
  ColorOverLife,
  ColorRange,
  ConeEmitter,
  ConstantValue,
  Gradient,
  IntervalValue,
  ParticleSystem,
  PiecewiseBezier,
  RenderMode,
  SizeOverLife,
  Vector3 as QVector3,
  Vector4 as QVector4,
} from "three.quarks";

interface HeroRecord {
  sys: ParticleSystem;
  die: number;
}

export class QuarksHero {
  readonly renderer: BatchedRenderer;
  private readonly fireMat: THREE.MeshBasicMaterial;
  private readonly smokeMat: THREE.MeshBasicMaterial;
  private readonly active: HeroRecord[] = [];
  private clock = 0;
  private maxConcurrent: number;

  constructor(fireTex: THREE.Texture, smokeTex: THREE.Texture, maxConcurrent = 4) {
    this.renderer = new BatchedRenderer();
    this.renderer.frustumCulled = false;
    this.maxConcurrent = maxConcurrent;
    this.fireMat = new THREE.MeshBasicMaterial({
      map: fireTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireMat.toneMapped = false;
    this.smokeMat = new THREE.MeshBasicMaterial({
      map: smokeTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.smokeMat.toneMapped = false;
  }

  get count(): number {
    return this.active.length;
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = n;
  }

  /** Spawn a batched fireball + smoke plume at a world position. Returns false when capped
   *  or when quarks throws (custom-core explosion layers still render regardless). */
  spawn(x: number, y: number, z: number, scale = 1, intensity = 1): boolean {
    if (this.maxConcurrent <= 0) return false;
    if (this.active.length >= this.maxConcurrent * 2) return false;
    try {
      const fire = this.makeFire(scale, intensity);
      const smoke = this.makeSmoke(scale, intensity);
      for (const sys of [fire, smoke]) {
        sys.emitter.position.set(x, y, z);
        this.renderer.addSystem(sys);
        this.renderer.add(sys.emitter);
        this.active.push({ sys, die: this.clock + sys.duration + 3.2 });
      }
      return true;
    } catch {
      return false;
    }
  }

  private makeFire(scale: number, intensity: number): ParticleSystem {
    const s = scale;
    const count = Math.floor((16 + 26 * intensity) * s);
    return new ParticleSystem({
      duration: 0.45,
      looping: false,
      autoDestroy: false,
      shape: new ConeEmitter({
        radius: 0.25 * s,
        angle: 0.7,
        thickness: 1,
        arc: Math.PI * 2,
        speed: new IntervalValue(2 * s, 7 * s),
      }),
      startLife: new IntervalValue(0.3, 0.7),
      startSpeed: new IntervalValue(1.5 * s, 5 * s),
      startSize: new IntervalValue(0.9 * s, 1.9 * s),
      startColor: new ColorRange(new QVector4(1, 0.86, 0.42, 1), new QVector4(1, 0.4, 0.12, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [
        { time: 0, count: new ConstantValue(count), cycle: 1, interval: 0, probability: 1 },
      ],
      worldSpace: true,
      material: this.fireMat,
      renderMode: RenderMode.BillBoard,
      behaviors: [
        new ApplyForce(new QVector3(0, 1, 0), new ConstantValue(3)),
        new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.9, 1.1, 1.2), 0]])),
        new ColorOverLife(
          new Gradient(
            [
              [new QVector3(1, 1, 1), 0],
              [new QVector3(0.5, 0.2, 0.1), 1],
            ],
            [
              [1, 0],
              [0, 1],
            ],
          ),
        ),
      ],
    });
  }

  private makeSmoke(scale: number, intensity: number): ParticleSystem {
    const s = scale;
    const count = Math.floor((12 + 20 * intensity) * s);
    return new ParticleSystem({
      duration: 0.8,
      looping: false,
      autoDestroy: false,
      shape: new ConeEmitter({
        radius: 0.4 * s,
        angle: 0.5,
        thickness: 1,
        arc: Math.PI * 2,
        speed: new IntervalValue(0.5 * s, 2.5 * s),
      }),
      startLife: new IntervalValue(1.3, 2.6),
      startSpeed: new IntervalValue(0.5 * s, 2 * s),
      startSize: new IntervalValue(1.6 * s, 3.6 * s),
      startColor: new ColorRange(
        new QVector4(0.26, 0.26, 0.28, 1),
        new QVector4(0.08, 0.08, 0.09, 1),
      ),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [
        { time: 0, count: new ConstantValue(count), cycle: 1, interval: 0, probability: 1 },
      ],
      worldSpace: true,
      material: this.smokeMat,
      renderMode: RenderMode.BillBoard,
      behaviors: [
        new ApplyForce(new QVector3(0, 1, 0), new ConstantValue(1.5)),
        new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 1.0, 1.4, 1.8), 0]])),
        new ColorOverLife(
          new Gradient(
            [[new QVector3(1, 1, 1), 0]],
            [
              [0, 0],
              [0.65, 0.2],
              [0, 1],
            ],
          ),
        ),
      ],
    });
  }

  update(dt: number): number {
    this.clock += dt;
    try {
      this.renderer.update(dt);
    } catch {
      /* a bad frame in quarks must never stall the render loop */
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const rec = this.active[i]!;
      const finished = rec.sys.particleNum <= 0 && this.clock > rec.die - 3.0;
      if (this.clock >= rec.die || finished) {
        try {
          this.renderer.deleteSystem(rec.sys);
          rec.sys.emitter.parent?.remove(rec.sys.emitter);
          rec.sys.dispose();
        } catch {
          /* ignore cleanup errors */
        }
        this.active.splice(i, 1);
      }
    }
    return this.active.length;
  }

  dispose(): void {
    for (const rec of this.active) {
      try {
        this.renderer.deleteSystem(rec.sys);
        rec.sys.emitter.parent?.remove(rec.sys.emitter);
        rec.sys.dispose();
      } catch {
        /* ignore */
      }
    }
    this.active.length = 0;
    this.fireMat.dispose();
    this.smokeMat.dispose();
  }
}
