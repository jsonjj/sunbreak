// The VFX orchestrator singleton. Owns the particle cores, mounts a single container into the
// live R3F scene (imperatively — no App/Scene edits), budget-gates spawns, and integrates +
// recycles everything each frame. The ECS render system is the only caller.
import * as THREE from "three";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useQuality } from "@/render/quality/useQuality";
import type { TierCaps, VfxEvent, VfxTier, WeatherState } from "../types";
import { Governor, TIER_CAPS, tierFromQuality } from "./budget";
import { captureRoot } from "./rootState";
import { getTextures } from "./textures";
import { bloomPulse } from "./bloom";
import { shake } from "./shake";
import { LightPool } from "./lights";
import { QuarksHero } from "./QuarksHero";
import { Billboards, makeBillboardSpawn } from "../particles/Billboards";
import { Points, makePointSpawn } from "../particles/Points";
import { GroundDecals } from "../particles/GroundDecals";
import { RainField } from "../particles/RainField";
import type { EmitContext } from "../emitters/context";
import { emitMuzzle } from "../emitters/muzzle";
import { emitImpact } from "../emitters/impact";
import { emitExplosion } from "../emitters/explosion";
import { emitSkid } from "../emitters/skid";
import {
  emberSpark,
  emitDust,
  emitLightning,
  emitSmoke,
  emitSpark,
  puffDust,
  puffExhaust,
  puffSmoke,
} from "../emitters/ambient";

export interface VfxStats {
  ready: boolean;
  tier: VfxTier;
  fire: number;
  smoke: number;
  sparks: number;
  decals: number;
  rain: number;
  lights: number;
  hero: number;
  fps: number;
}

const _camPos = new THREE.Vector3();
const CULL_AMBIENT = 130; // metres — ambient/dust/skid beyond this is skipped
const CULL_CRITICAL = 450; // metres — even flashes are pointless past this

export class VfxManager {
  private tier: VfxTier = "MED";
  private caps: TierCaps = TIER_CAPS.MED;
  private autoTier = true;
  private mounted = false;
  private readonly governor = new Governor();

  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private gl: THREE.WebGLRenderer | null = null;

  private readonly group = new THREE.Group();
  private rootEntity: ClientEntity | null = null;
  private unsubQuality: (() => void) | null = null;

  private readonly fire: Billboards;
  private readonly smoke: Billboards;
  private readonly sparks: Points;
  private readonly decals: GroundDecals;
  private readonly rain: RainField;
  private readonly lights: LightPool;
  private readonly hero: QuarksHero;
  private readonly ctx: EmitContext;

  private weather: WeatherState = { rain: 0, wind: { x: 0, y: 0, z: 0 }, cat: 0, wetness: 0 };

  constructor() {
    // Allocate every core to the HIGH ceiling once; tiers apply soft caps (no realloc).
    const hi = TIER_CAPS.HIGH;
    const tex = getTextures();
    this.fire = new Billboards(hi.maxAdditive, tex.glow, true, 10);
    this.smoke = new Billboards(hi.maxSmoke, tex.smoke, false, 9);
    this.sparks = new Points(hi.maxSparks, tex.spark, 11);
    this.decals = new GroundDecals(hi.maxDecals, tex.smear, 5);
    this.rain = new RainField(hi.maxRain, tex.streak, 8);
    this.lights = new LightPool(hi.maxLights, hi.maxLights);
    this.hero = new QuarksHero(tex.glow, tex.smoke, hi.maxHero);

    this.group.name = "vfx-root";
    this.group.matrixAutoUpdate = false;
    this.group.add(this.decals.mesh);
    this.group.add(this.rain.mesh);
    this.group.add(this.smoke.mesh);
    this.group.add(this.fire.mesh);
    this.group.add(this.sparks.points);
    this.group.add(this.hero.renderer);
    this.group.add(this.lights.group);

    this.ctx = {
      fire: this.fire,
      smoke: this.smoke,
      sparks: this.sparks,
      decals: this.decals,
      lights: this.lights,
      hero: this.hero,
      caps: this.caps,
      quality: 1,
      bloom: (a: number) => bloomPulse.pulse(a),
      bb: makeBillboardSpawn(),
      pt: makePointSpawn(),
    };

    this.applyTier(tierFromQuality(useQuality.getState().tier));
  }

  get ready(): boolean {
    return this.mounted;
  }

  get object(): THREE.Object3D {
    return this.group;
  }

  // ── Tier / weather control ──────────────────────────────────────────────────────────

  private applyTier(tier: VfxTier): void {
    this.tier = tier;
    const c = TIER_CAPS[tier];
    this.caps = c;
    this.ctx.caps = c;
    this.fire.setSoftCap(c.maxAdditive);
    this.smoke.setSoftCap(c.maxSmoke);
    this.sparks.setSoftCap(c.maxSparks);
    this.decals.setSoftCap(c.maxDecals);
    this.lights.setMax(c.maxLights);
    this.hero.setMaxConcurrent(c.maxHero);
  }

  /** Manual tier override (disables auto-follow of the global quality store). */
  setTier(tier: VfxTier): void {
    this.autoTier = false;
    this.applyTier(tier);
  }

  setAutoTier(on: boolean): void {
    this.autoTier = on;
    if (on) this.applyTier(tierFromQuality(useQuality.getState().tier));
  }

  setWeather(w: WeatherState): void {
    this.weather = w;
  }

  getWeather(): WeatherState {
    return this.weather;
  }

  // ── Mounting ────────────────────────────────────────────────────────────────────────

  /** Capture the live R3F root and attach the container. Idempotent; safe every frame. */
  ensureReady(): boolean {
    if (this.mounted) {
      // A future ECS↔R3F bridge could re-parent the container; keep it in the scene.
      if (this.scene && this.group.parent === null) this.scene.add(this.group);
      return true;
    }
    const root = captureRoot();
    if (!root) return false;
    this.scene = root.scene;
    this.camera = root.camera;
    this.gl = root.gl;
    this.scene.add(this.group);

    // Register the container as an ECS entity's `three` view component (discoverable in ECS;
    // we attach to the scene ourselves since no bridge is mounted in v0).
    const ent: ClientEntity = { vfx_root: true, three: this.group };
    this.rootEntity = ent;
    world.add(ent);

    this.unsubQuality = useQuality.subscribe((s) => {
      if (this.autoTier) this.applyTier(tierFromQuality(s.tier));
    });

    this.mounted = true;
    return true;
  }

  // ── Spawning ────────────────────────────────────────────────────────────────────────

  private cull(e: VfxEvent): boolean {
    if (!this.camera) return false;
    this.camera.getWorldPosition(_camPos);
    const dx = e.position.x - _camPos.x;
    const dy = e.position.y - _camPos.y;
    const dz = e.position.z - _camPos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const critical = e.type === "muzzle" || e.type === "explosion" || e.type === "impact";
    const limit = critical ? CULL_CRITICAL : CULL_AMBIENT;
    return d2 > limit * limit;
  }

  /** The single public spawn entry point. Budget-culled, then dispatched to an emitter. */
  spawn(e: VfxEvent): void {
    if (!this.mounted) return;
    if (e.type === "rain") {
      this.weather = {
        rain: e.intensity ?? 1,
        wind: this.weather.wind,
        cat: this.weather.cat ?? 0,
        wetness: this.weather.wetness ?? 0,
      };
      return;
    }
    if (this.cull(e)) return;
    const ctx = this.ctx;
    switch (e.type) {
      case "muzzle":
        emitMuzzle(ctx, e);
        break;
      case "impact":
        emitImpact(ctx, e);
        break;
      case "explosion":
        emitExplosion(ctx, e);
        break;
      case "skid":
        emitSkid(ctx, e);
        break;
      case "smoke":
        emitSmoke(ctx, e);
        break;
      case "dust":
        emitDust(ctx, e);
        break;
      case "spark":
        emitSpark(ctx, e);
        break;
      case "lightning":
        emitLightning(ctx, e);
        break;
      case "blood": {
        const prev = e.surface;
        e.surface = e.surface ?? "flesh";
        emitImpact(ctx, e);
        e.surface = prev;
        break;
      }
    }
  }

  // ── Continuous emitter pumps (driven by ECS component state each frame) ───────────────

  pumpExhaust(x: number, y: number, z: number, color?: number): void {
    if (this.exceededAmbient(x, y, z)) return;
    puffExhaust(this.ctx, x, y, z, color);
  }

  pumpDust(x: number, y: number, z: number, scale: number, color?: number): void {
    if (this.exceededAmbient(x, y, z)) return;
    puffDust(this.ctx, x, y, z, scale, color);
  }

  pumpSmoke(x: number, y: number, z: number, scale: number, color?: number): void {
    if (this.exceededAmbient(x, y, z)) return;
    puffSmoke(this.ctx, x, y, z, scale, color);
  }

  pumpSpark(x: number, y: number, z: number, scale: number, color?: number): void {
    if (this.exceededAmbient(x, y, z)) return;
    emberSpark(this.ctx, x, y, z, scale, color);
  }

  pumpSkid(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    intensity: number,
    scale: number,
    smoke: boolean,
  ): void {
    if (this.exceededAmbient(x, y, z)) return;
    const yaw = Math.atan2(dirX, dirZ);
    this.decals.add(x, y + 0.01, z, yaw, 0.6 * scale, 0.22 * scale, intensity, 14, 0.04, 0.04, 0.05);
    if (smoke && intensity > 0.7 && Math.random() < 0.35) {
      puffSmoke(this.ctx, x, y + 0.1, z, 0.5 * scale, 0x6a6a6c);
    }
  }

  private exceededAmbient(x: number, y: number, z: number): boolean {
    if (!this.camera) return false;
    this.camera.getWorldPosition(_camPos);
    const dx = x - _camPos.x;
    const dy = y - _camPos.y;
    const dz = z - _camPos.z;
    return dx * dx + dy * dy + dz * dz > CULL_AMBIENT * CULL_AMBIENT;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────────────────

  /** Integrate all cores, drive rain, decay signals. Call once per frame AFTER draining
   *  spawns. Returns quietly until `ensureReady()` has mounted the container. */
  update(dt: number): void {
    if (!this.mounted) return;
    const q = this.governor.sample(dt);
    this.ctx.quality = q;
    const sdt = dt > 0.05 ? 0.05 : dt;

    if (this.gl) {
      const h = this.gl.domElement.height;
      if (h > 0) this.sparks.setHeightScale(h);
    }

    this.fire.update(sdt);
    this.smoke.update(sdt);
    this.sparks.update(sdt);
    this.decals.update(sdt);
    this.lights.update(sdt);
    this.hero.update(sdt);
    if (this.camera) this.rain.update(sdt, this.camera, this.weather, q, this.caps.maxRain);

    bloomPulse.decay(sdt);
    shake.decay(sdt);
  }

  get stats(): VfxStats {
    return {
      ready: this.mounted,
      tier: this.tier,
      fire: this.fire.live,
      smoke: this.smoke.live,
      sparks: this.sparks.live,
      decals: this.decals.live,
      rain: this.rain.live,
      lights: this.lights.live,
      hero: this.hero.count,
      fps: Math.round(this.governor.fps),
    };
  }

  dispose(): void {
    this.unsubQuality?.();
    this.unsubQuality = null;
    if (this.rootEntity) {
      world.remove(this.rootEntity);
      this.rootEntity = null;
    }
    if (this.scene) this.scene.remove(this.group);
    this.fire.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
    this.decals.dispose();
    this.rain.dispose();
    this.lights.dispose();
    this.hero.dispose();
    this.mounted = false;
  }
}

/** The process-wide VFX manager singleton. */
export const vfxManager = new VfxManager();
