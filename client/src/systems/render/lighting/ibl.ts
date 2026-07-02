// Image-based lighting (IBL) without any vendored asset. We prefilter the SAME procedural sky
// into a PMREM environment map, so every material gets sky-accurate ambient light + reflections
// that track the day/night cycle. Zero network, zero files — fully offline and self-contained.
//
// Regeneration is throttled (the sky changes slowly), while intensity + rotation follow every
// frame. To swap in a vendored CC0 `.hdr` later, load it with RGBELoader and feed
// `pmrem.fromEquirectangular(tex)` instead of `fromScene` — the rest of the pipeline is unchanged.
import { PMREMGenerator, Scene } from "three";
import type { WebGLRenderer, WebGLRenderTarget } from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { applySkyUniforms, envIntensity } from "./look";
import type { LightSky } from "./light.components";

/** Minimum change in sim-hours before we rebuild the (relatively expensive) prefiltered map. */
const REGEN_HOUR_STEP = 0.25;

export class IblManager {
  private pmrem: PMREMGenerator | null = null;
  private rt: WebGLRenderTarget | null = null;
  private readonly envScene = new Scene();
  private readonly envSky = new Sky();
  private lastHour = Number.NEGATIVE_INFINITY;

  constructor() {
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
  }

  update(renderer: WebGLRenderer, scene: Scene, hour: number, sky: LightSky): void {
    // Cheap, every-frame follow.
    scene.environmentIntensity = envIntensity(sky.dayAmount);
    scene.environmentRotation.set(0, -sky.azimuth, 0);

    // Throttled, wrap-aware regeneration.
    let drift = Math.abs(hour - this.lastHour);
    if (drift > 12) drift = 24 - drift;
    if (this.rt && drift < REGEN_HOUR_STEP) return;
    this.lastHour = hour;
    this.regenerate(renderer, scene, sky);
  }

  private regenerate(renderer: WebGLRenderer, scene: Scene, sky: LightSky): void {
    if (!this.pmrem) this.pmrem = new PMREMGenerator(renderer);
    applySkyUniforms(this.envSky, sky.dayAmount, sky.sunDir);
    const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 1100);
    const prev = this.rt;
    this.rt = next;
    scene.environment = next.texture;
    prev?.dispose();
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    this.pmrem?.dispose();
    this.pmrem = null;
    this.envSky.geometry.dispose();
    this.envSky.material.dispose();
    this.envScene.clear();
  }
}
