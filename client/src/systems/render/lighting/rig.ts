// The live THREE lighting rig: one group holding the single shadow-casting key light (sun by
// day / moon by night), hemisphere + ambient fill, the procedural sky dome, and a star field.
// This group is attached to a singleton ECS entity's `three` view component, so it reaches the
// scene through the ECS↔R3F bridge (no hand-mounting into App/Scene).
//
// The sky dome doubles as our render-context probe: its `onBeforeRender` captures the live
// renderer/scene/camera each frame so the render-phase system can drive scene-level state
// (environment, fog) and regenerate the IBL — all without any R3F hooks.
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Points,
  PointsMaterial,
} from "three";
import type { Camera, Scene, WebGLRenderer } from "three";
import { Sky } from "three/addons/objects/Sky.js";

export interface RenderCtx {
  renderer: WebGLRenderer | null;
  scene: Scene | null;
  camera: Camera | null;
}

export interface LightingRig {
  group: Group;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  ambient: AmbientLight;
  sky: Sky;
  stars: Points;
  starsMaterial: PointsMaterial;
  ctx: RenderCtx;
  /** Last applied shadow map resolution (so we only rebuild the shadow map on change). */
  lastShadowMap: number;
}

const STAR_COUNT = 1400;
const STAR_RADIUS = 900; // inside the v0 camera far plane (1200) so stars are not clipped

function makeStars(): { points: Points; material: PointsMaterial } {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Upper hemisphere bias: stars mostly overhead, none far below the horizon.
    const u = Math.random();
    const v = Math.random() * 0.85 + 0.05;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v); // 0 = zenith
    const s = Math.sin(phi);
    positions[i * 3 + 0] = Math.cos(theta) * s * STAR_RADIUS;
    positions[i * 3 + 1] = Math.cos(phi) * STAR_RADIUS;
    positions[i * 3 + 2] = Math.sin(theta) * s * STAR_RADIUS;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: new Color("#eaf0ff"),
    size: 1.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.name = "sunbreak-stars";
  points.frustumCulled = false;
  points.renderOrder = -1;
  return { points, material: mat };
}

export function createLightingRig(): LightingRig {
  const group = new Group();
  group.name = "sunbreak-lighting-rig";

  // The one shadow-casting directional light. Its shadow camera follows the player each frame.
  const sun = new DirectionalLight(0xffffff, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.04;
  const cam = sun.shadow.camera;
  cam.near = 1;
  cam.far = 260;
  cam.left = -80;
  cam.right = 80;
  cam.top = 80;
  cam.bottom = -80;
  cam.updateProjectionMatrix();
  group.add(sun);
  group.add(sun.target);

  const hemi = new HemisphereLight(0xbcd6ff, 0x5a5040, 0.6);
  group.add(hemi);

  const ambient = new AmbientLight(0xffffff, 0.2);
  group.add(ambient);

  const sky = new Sky();
  sky.name = "sunbreak-sky";
  sky.scale.setScalar(450000);
  group.add(sky);

  const { points: stars, material: starsMaterial } = makeStars();
  group.add(stars);

  const ctx: RenderCtx = { renderer: null, scene: null, camera: null };
  // The sky dome renders every frame → its onBeforeRender is a free, reliable render-context probe.
  sky.onBeforeRender = (renderer, scene, camera) => {
    ctx.renderer = renderer;
    ctx.scene = scene;
    ctx.camera = camera;
  };

  return { group, sun, hemi, ambient, sky, stars, starsMaterial, ctx, lastShadowMap: 2048 };
}

export function disposeLightingRig(rig: LightingRig): void {
  rig.sky.onBeforeRender = () => {};
  rig.sun.shadow.map?.dispose();
  rig.sun.dispose();
  rig.sky.geometry.dispose();
  rig.sky.material.dispose();
  rig.stars.geometry.dispose();
  rig.starsMaterial.dispose();
  rig.group.clear();
  rig.ctx.renderer = null;
  rig.ctx.scene = null;
  rig.ctx.camera = null;
}
