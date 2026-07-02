// The stateful heart of the subsystem. Owns the singleton lighting entity + the THREE rig, and
// exposes three per-frame steps wired to ECS phases from index.ts:
//   tick()   (update phase) — advance/read the clock, recompute solar state into `light_sky`
//   render() (render phase) — drive lights/sky/stars/fog + regenerate IBL from that state
//   mirror() (finish phase) — project the clock into the `useTimeOfDay` store for the HUD/UI
//
// The rig reaches the scene ONLY through the entity's `three` view component (the ECS↔R3F
// bridge). Scene-level work (fog, environment) uses the renderer/scene captured by the sky's
// onBeforeRender probe, so nothing here needs an R3F hook or a hand-mount into App/Scene.
import { Color, FogExp2, MathUtils, Vector3 } from "three";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { dayAmountFromSunY, sunPositionFromHour, wrapHour } from "./solar";
import {
  ambientIntensity,
  applySkyUniforms,
  fogColor,
  hemiGroundColor,
  hemiIntensity,
  hemiSkyColor,
  keyIntensity,
  keyLightColor,
  starOpacity,
} from "./look";
import { createLightingRig, disposeLightingRig, type LightingRig } from "./rig";
import { IblManager } from "./ibl";
import { lightingCaps, type LightingCaps } from "./quality";
import { phaseOf, useTimeOfDay } from "./timeOfDayStore";
import { createDefaultClock, createDefaultSky } from "./light.components";

// Module-scope scratch — no per-frame allocation.
const SUN = new Vector3();
const KEY = new Vector3();
const COL_A = new Color();
const COL_B = new Color();

const SHADOW_FOLLOW_DISTANCE = 90;

export class LightingRuntime {
  private readonly clockQ = world.with("light_clock");
  private readonly playerQ = world.with("isPlayer", "transform");

  private rig: LightingRig | null = null;
  private entity: ClientEntity | null = null;
  private ibl: IblManager | null = null;
  private fog: FogExp2 | null = null;

  private currentHour = 8;
  private lastMirrorHour = Number.NEGATIVE_INFINITY;
  private teardownDevKeys: (() => void) | null = null;

  init(): void {
    const rig = createLightingRig();
    this.rig = rig;
    this.ibl = new IblManager();
    this.fog = new FogExp2(0xc3d6e6, 0.008);

    // Adopt an existing (authoritative) clock if some other subsystem already created one;
    // otherwise own a self-advancing fallback so lighting works standalone.
    const hasExternalClock = this.clockQ.entities.length > 0;
    const entity: ClientEntity = {
      light_rig: true,
      light_sky: createDefaultSky(),
      three: rig.group,
    };
    if (!hasExternalClock) entity.light_clock = createDefaultClock();
    world.add(entity);
    this.entity = entity;

    this.installDevKeys();
  }

  dispose(): void {
    this.teardownDevKeys?.();
    this.teardownDevKeys = null;

    const scene = this.rig?.ctx.scene;
    if (scene) {
      scene.environment = null;
      if (scene.fog === this.fog) scene.fog = null;
    }
    if (this.entity) {
      world.remove(this.entity);
      this.entity = null;
    }
    if (this.rig) {
      disposeLightingRig(this.rig);
      this.rig = null;
    }
    this.ibl?.dispose();
    this.ibl = null;
    this.fog = null;
  }

  /** update phase: advance the owned clock (or follow an external one) and recompute solar state. */
  tick(dt: number): void {
    const sky = this.entity?.light_sky;
    if (!sky) return;

    const clock = this.clockQ.entities[0]?.light_clock;
    if (clock?.autoAdvance) {
      clock.hour = wrapHour(clock.hour + dt * (24 / clock.cycleSeconds) * clock.timeScale);
    }
    const hour = clock?.hour ?? this.currentHour;
    this.currentHour = hour;

    sunPositionFromHour(hour, SUN);
    sky.sunDir.x = SUN.x;
    sky.sunDir.y = SUN.y;
    sky.sunDir.z = SUN.z;
    sky.moonDir.x = -SUN.x;
    sky.moonDir.y = -SUN.y;
    sky.moonDir.z = -SUN.z;
    sky.dayAmount = dayAmountFromSunY(SUN.y);
    sky.azimuth = Math.atan2(SUN.x, SUN.z);
    sky.keyAboveHorizon = SUN.y >= 0;
  }

  /** render phase: push the solar state onto the live THREE objects + scene. */
  render(): void {
    const rig = this.rig;
    const sky = this.entity?.light_sky;
    if (!rig || !sky) return;

    const caps = lightingCaps();

    // Key light = sun by day, moon by night (single shadow-caster; the moon is the sun's antipode).
    const isMoon = !sky.keyAboveHorizon;
    if (isMoon) KEY.set(sky.moonDir.x, sky.moonDir.y, sky.moonDir.z);
    else KEY.set(sky.sunDir.x, sky.sunDir.y, sky.sunDir.z);
    const keyElevation = KEY.y;

    keyLightColor(COL_A, keyElevation, isMoon);
    rig.sun.color.copy(COL_A);
    rig.sun.intensity = keyIntensity(keyElevation, isMoon);

    hemiSkyColor(COL_A, sky.dayAmount);
    hemiGroundColor(COL_B, sky.dayAmount);
    rig.hemi.color.copy(COL_A);
    rig.hemi.groundColor.copy(COL_B);
    rig.hemi.intensity = hemiIntensity(sky.dayAmount);
    rig.ambient.intensity = ambientIntensity(sky.dayAmount);

    applySkyUniforms(rig.sky, sky.dayAmount, sky.sunDir);

    rig.starsMaterial.opacity = starOpacity(sky.dayAmount);
    rig.stars.visible = rig.starsMaterial.opacity > 0.001;

    this.applyShadow(rig, caps);

    // Scene-level state needs the live renderer/scene captured by the sky's onBeforeRender probe.
    const ctx = rig.ctx;
    if (ctx.scene && this.fog) {
      fogColor(COL_A, sky.dayAmount);
      this.fog.color.copy(COL_A);
      this.fog.density = caps.fogDensity * MathUtils.lerp(1.4, 0.8, sky.dayAmount);
      ctx.scene.fog = this.fog;
    }
    if (ctx.renderer && ctx.scene && this.ibl) {
      this.ibl.update(ctx.renderer, ctx.scene, this.currentHour, sky);
    }
  }

  /** finish phase: throttled projection into the React-facing store. */
  mirror(): void {
    const sky = this.entity?.light_sky;
    if (!sky) return;

    let drift = Math.abs(this.currentHour - this.lastMirrorHour);
    if (drift > 12) drift = 24 - drift;
    if (drift < 0.01) return;
    this.lastMirrorHour = this.currentHour;

    useTimeOfDay
      .getState()
      .apply(this.currentHour, sky.dayAmount, phaseOf(this.currentHour, sky.dayAmount), sky.sunDir);
  }

  private applyShadow(rig: LightingRig, caps: LightingCaps): void {
    rig.sun.castShadow = caps.shadowsEnabled;
    if (rig.lastShadowMap !== caps.shadowMapSize) {
      rig.sun.shadow.mapSize.set(caps.shadowMapSize, caps.shadowMapSize);
      rig.sun.shadow.map?.dispose();
      rig.sun.shadow.map = null;
      rig.lastShadowMap = caps.shadowMapSize;
    }

    // Keep the tight shadow frustum centered on the player so shadows stay crisp near the camera.
    const p = this.playerQ.entities[0]?.transform?.position;
    const px = p?.x ?? 0;
    const py = p?.y ?? 0;
    const pz = p?.z ?? 0;
    rig.sun.position.set(
      px + KEY.x * SHADOW_FOLLOW_DISTANCE,
      py + KEY.y * SHADOW_FOLLOW_DISTANCE,
      pz + KEY.z * SHADOW_FOLLOW_DISTANCE,
    );
    rig.sun.target.position.set(px, py, pz);
    rig.sun.target.updateMatrixWorld();
  }

  // Dev-only clock scrub, gated behind Alt to avoid clashing with other subsystems' hotkeys:
  //   Alt+[ / Alt+]  step time back/forward   Alt+\  toggle auto-advance   Alt+- / Alt+=  timeScale
  private installDevKeys(): void {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey) return;
      const clock = this.clockQ.entities[0]?.light_clock;
      if (!clock) return;
      switch (e.code) {
        case "BracketLeft":
          clock.hour = wrapHour(clock.hour - 0.5);
          break;
        case "BracketRight":
          clock.hour = wrapHour(clock.hour + 0.5);
          break;
        case "Backslash":
          clock.autoAdvance = !clock.autoAdvance;
          break;
        case "Minus":
          clock.timeScale = Math.max(0, clock.timeScale / 1.5);
          break;
        case "Equal":
          clock.timeScale = Math.min(4000, clock.timeScale * 1.5);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    this.teardownDevKeys = () => window.removeEventListener("keydown", onKey);
  }
}
