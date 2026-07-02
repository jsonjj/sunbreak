// The instanced crowd humanoid: a low-poly, feet-origin (~1.8m, facing -Z) figure whose limbs are
// swung procedurally in the VERTEX SHADER from per-instance (phase, speed) attributes, and whose
// skin / top / bottom / hair colours are per-instance attributes too. This is the "GPU skinning
// stand-in" that lets hundreds of peds render in ONE draw call per archetype while still striding,
// swinging their arms, and reading as a varied crowd (no CPU skinning, no clones).
//
// Region ids (per vertex) drive which limb each vertex belongs to; the shader rotates it about the
// matching joint pivot. Gaits are FORWARD-facing by construction (thigh swings toward -Z, knee folds
// back) — the same convention as the hero rig, so there's no reversed "moonwalk".

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ── Region ids (vertex → limb) ────────────────────────────────────────────────────────────────
export const REG = {
  CORE: 0, // head / torso / hips / neck (no swing)
  L_THIGH: 1,
  L_SHIN: 2, // shin + foot
  R_THIGH: 3,
  R_SHIN: 4,
  L_UARM: 5,
  L_FARM: 6, // forearm + hand
  R_UARM: 7,
  R_FARM: 8,
  HAIR: 9, // always shown, tinted from the hair channel
  HAT: 10, // toggled per-instance via iAnim.z
} as const;

// ── Palette channel ids (vertex → which per-instance colour) ────────────────────────────────────
const CH = { SKIN: 0, TOP: 1, BOTTOM: 2, HAIR: 3, SHOE: 4 } as const;

// Head centre (used by the shader to collapse an unworn hat inside the skull).
export const HEAD_Y = 1.62;

function tagged(geo: THREE.BufferGeometry, region: number, channel: number): THREE.BufferGeometry {
  geo.deleteAttribute("uv");
  const n = geo.getAttribute("position").count;
  const r = new Float32Array(n);
  const c = new Float32Array(n);
  r.fill(region);
  c.fill(channel);
  geo.setAttribute("aRegion", new THREE.BufferAttribute(r, 1));
  geo.setAttribute("aChannel", new THREE.BufferAttribute(c, 1));
  return geo;
}

/** Vertical tapered limb between two Y heights at a given x. */
function limb(
  rTop: number,
  rBot: number,
  yTop: number,
  yBot: number,
  x: number,
  region: number,
  channel: number,
): THREE.BufferGeometry {
  const h = yTop - yBot;
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 8, 1); // low radial count — it's a crowd LOD
  g.translate(x, (yTop + yBot) / 2, 0);
  return tagged(g, region, channel);
}

function ball(
  r: number,
  x: number,
  y: number,
  z: number,
  s: readonly [number, number, number],
  region: number,
  channel: number,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 10, 8); // crowd LOD sphere
  g.scale(s[0], s[1], s[2]);
  g.translate(x, y, z);
  return tagged(g, region, channel);
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  region: number,
  channel: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tagged(g, region, channel);
}

/** Build ONE canonical crowd humanoid geometry (shared attribute data; each archetype mesh gets its
 *  own copy so it can carry its own per-instance attributes). */
export function buildCrowdGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // head + neck
    ball(0.115, 0, HEAD_Y, 0.006, [1.0, 1.08, 1.02], REG.CORE, CH.SKIN),
    ball(0.05, 0, 1.53, 0, [1, 1, 1], REG.CORE, CH.SKIN),
    // torso (top) + pelvis (bottom)
    limb(0.16, 0.132, 1.48, 0.96, 0, REG.CORE, CH.TOP),
    limb(0.135, 0.152, 0.96, 0.8, 0, REG.CORE, CH.BOTTOM),
    // shoulders (swing with the upper arms)
    ball(0.072, 0.17, 1.45, 0, [1, 1, 1], REG.L_UARM, CH.TOP),
    ball(0.072, -0.17, 1.45, 0, [1, 1, 1], REG.R_UARM, CH.TOP),
    // arms
    limb(0.05, 0.045, 1.45, 1.18, 0.18, REG.L_UARM, CH.TOP),
    limb(0.05, 0.045, 1.45, 1.18, -0.18, REG.R_UARM, CH.TOP),
    limb(0.044, 0.036, 1.18, 0.95, 0.18, REG.L_FARM, CH.SKIN),
    limb(0.044, 0.036, 1.18, 0.95, -0.18, REG.R_FARM, CH.SKIN),
    ball(0.05, 0.18, 0.92, 0, [1, 1.1, 0.85], REG.L_FARM, CH.SKIN),
    ball(0.05, -0.18, 0.92, 0, [1, 1.1, 0.85], REG.R_FARM, CH.SKIN),
    // legs
    limb(0.082, 0.062, 0.9, 0.48, 0.1, REG.L_THIGH, CH.BOTTOM),
    limb(0.082, 0.062, 0.9, 0.48, -0.1, REG.R_THIGH, CH.BOTTOM),
    limb(0.06, 0.045, 0.48, 0.1, 0.1, REG.L_SHIN, CH.BOTTOM),
    limb(0.06, 0.045, 0.48, 0.1, -0.1, REG.R_SHIN, CH.BOTTOM),
    // feet (forward is -Z)
    box(0.11, 0.07, 0.26, 0.1, 0.035, -0.06, REG.L_SHIN, CH.SHOE),
    box(0.11, 0.07, 0.26, -0.1, 0.035, -0.06, REG.R_SHIN, CH.SHOE),
    // hair (always present, tinted; sits over the skull)
    ball(0.125, 0, HEAD_Y + 0.03, 0.006, [1.06, 0.98, 1.06], REG.HAIR, CH.HAIR),
    // hat (crown + brim) — collapsed inside the head when not worn
    ball(0.128, 0, HEAD_Y + 0.11, 0.006, [1.02, 0.62, 1.02], REG.HAT, CH.TOP),
    box(0.26, 0.03, 0.16, 0, HEAD_Y + 0.085, -0.13, REG.HAT, CH.TOP),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("peds: failed to merge crowd humanoid geometry");
  // Peds roam the whole map on one mesh; never per-mesh frustum-cull.
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1e6);
  return merged;
}

// ── Shader injection (onBeforeCompile) ──────────────────────────────────────────────────────────
// Injected into MeshStandardMaterial (lit crowd) AND MeshDepthMaterial (matching shadows) so both
// see the same procedural stride + hat toggle.

/** Shared clock uniform (seconds) so standing peds still breathe/sway. Advanced by the render tick. */
export const crowdUniforms = { uTime: { value: 0 } };

const PRELUDE = /* glsl */ `
uniform float uTime;
attribute float aRegion;
attribute float aChannel;
attribute vec3 iColBody;
attribute vec3 iColTop;
attribute vec3 iColBottom;
attribute vec3 iColHair;
attribute vec4 iAnim; // x=phase(0..1) y=speed01 z=hasHat w=reserved
const vec3 CR_LHIP = vec3(0.1, 0.9, 0.0);
const vec3 CR_RHIP = vec3(-0.1, 0.9, 0.0);
const vec3 CR_LKNEE = vec3(0.1, 0.48, 0.0);
const vec3 CR_RKNEE = vec3(-0.1, 0.48, 0.0);
const vec3 CR_LSHO = vec3(0.18, 1.45, 0.0);
const vec3 CR_RSHO = vec3(-0.18, 1.45, 0.0);
const vec3 CR_LELB = vec3(0.18, 1.18, 0.0);
const vec3 CR_RELB = vec3(-0.18, 1.18, 0.0);
vec3 crRotX(vec3 v, float a) {
  float c = cos(a); float s = sin(a);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}
`;

// Declares cr_* at function scope (NO braces) so the position block can reuse them.
const ANGLES = /* glsl */ `
  float cr_ph = iAnim.x;
  float cr_spd = clamp(iAnim.y, 0.0, 1.0);
  float cr_legAmp = mix(0.05, 0.85, cr_spd);
  float cr_armAmp = mix(0.04, 0.7, cr_spd);
  float cr_pl = cr_ph;
  float cr_pr = cr_ph + 0.5;
  float cr_thighL = cr_legAmp * cos(6.2831853 * cr_pl);
  float cr_thighR = cr_legAmp * cos(6.2831853 * cr_pr);
  float cr_kneeL = -(0.08 + (0.4 + 0.7 * cr_spd) * pow(max(0.0, sin(6.2831853 * (cr_pl - 0.5))), 1.3));
  float cr_kneeR = -(0.08 + (0.4 + 0.7 * cr_spd) * pow(max(0.0, sin(6.2831853 * (cr_pr - 0.5))), 1.3));
  float cr_armL = -cr_armAmp * cos(6.2831853 * cr_pl);
  float cr_armR = -cr_armAmp * cos(6.2831853 * cr_pr);
  float cr_elbowL = -(0.12 + 0.5 * cr_spd * max(0.0, sin(6.2831853 * cr_pl)));
  float cr_elbowR = -(0.12 + 0.5 * cr_spd * max(0.0, sin(6.2831853 * cr_pr)));
  // Idle life: when nearly stopped, add a slow breathing rise + a faint out-of-phase arm sway,
  // desynced per instance via iAnim.w so a standing crowd isn't a frozen mannequin field.
  float cr_idle = 1.0 - cr_spd;
  float cr_wob = uTime * 1.5 + iAnim.w * 6.2831853;
  float cr_breath = (0.5 - 0.5 * cos(cr_wob)) * 0.012 * cr_idle;
  cr_armL += cr_idle * 0.05 * sin(uTime * 0.9 + iAnim.w * 6.2831853);
  cr_armR += cr_idle * 0.05 * sin(uTime * 0.9 + iAnim.w * 6.2831853 + 3.14159);
  int cr_reg = int(aRegion + 0.5);
`;

const NORMAL_MOD = /* glsl */ `
  if (cr_reg == 1) objectNormal = crRotX(objectNormal, cr_thighL);
  else if (cr_reg == 2) objectNormal = crRotX(crRotX(objectNormal, cr_kneeL), cr_thighL);
  else if (cr_reg == 3) objectNormal = crRotX(objectNormal, cr_thighR);
  else if (cr_reg == 4) objectNormal = crRotX(crRotX(objectNormal, cr_kneeR), cr_thighR);
  else if (cr_reg == 5) objectNormal = crRotX(objectNormal, cr_armL);
  else if (cr_reg == 6) objectNormal = crRotX(crRotX(objectNormal, cr_elbowL), cr_armL);
  else if (cr_reg == 7) objectNormal = crRotX(objectNormal, cr_armR);
  else if (cr_reg == 8) objectNormal = crRotX(crRotX(objectNormal, cr_elbowR), cr_armR);
`;

const POSITION_MOD = /* glsl */ `
  if (cr_reg == 1) transformed = CR_LHIP + crRotX(transformed - CR_LHIP, cr_thighL);
  else if (cr_reg == 2) {
    transformed = CR_LKNEE + crRotX(transformed - CR_LKNEE, cr_kneeL);
    transformed = CR_LHIP + crRotX(transformed - CR_LHIP, cr_thighL);
  } else if (cr_reg == 3) transformed = CR_RHIP + crRotX(transformed - CR_RHIP, cr_thighR);
  else if (cr_reg == 4) {
    transformed = CR_RKNEE + crRotX(transformed - CR_RKNEE, cr_kneeR);
    transformed = CR_RHIP + crRotX(transformed - CR_RHIP, cr_thighR);
  } else if (cr_reg == 5) transformed = CR_LSHO + crRotX(transformed - CR_LSHO, cr_armL);
  else if (cr_reg == 6) {
    transformed = CR_LELB + crRotX(transformed - CR_LELB, cr_elbowL);
    transformed = CR_LSHO + crRotX(transformed - CR_LSHO, cr_armL);
  } else if (cr_reg == 7) transformed = CR_RSHO + crRotX(transformed - CR_RSHO, cr_armR);
  else if (cr_reg == 8) {
    transformed = CR_RELB + crRotX(transformed - CR_RELB, cr_elbowR);
    transformed = CR_RSHO + crRotX(transformed - CR_RSHO, cr_armR);
  } else if (cr_reg == 10) {
    if (iAnim.z < 0.5) transformed = vec3(0.0, ${HEAD_Y.toFixed(3)}, 0.0);
  }
  transformed.y += cr_breath * smoothstep(0.5, 1.5, position.y);
`;

const COLOR_MOD = /* glsl */ `
  int cr_ch = int(aChannel + 0.5);
  vec3 cr_col = iColBody;
  if (cr_ch == 1) cr_col = iColTop;
  else if (cr_ch == 2) cr_col = iColBottom;
  else if (cr_ch == 3) cr_col = iColHair;
  else if (cr_ch == 4) cr_col = iColBottom * 0.35;
  vCrowdColor = cr_col;
`;

function patchVertex(shader: { vertexShader: string }, withColor: boolean): void {
  const prelude = withColor ? `${PRELUDE}\nvarying vec3 vCrowdColor;\n` : PRELUDE;
  shader.vertexShader = prelude + shader.vertexShader;
  if (withColor) {
    // Main material: angles + normal at beginnormal (before defaultnormal consumes objectNormal),
    // then position + colour at begin_vertex (transformed now exists; cr_* vars still in scope).
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>\n${ANGLES}\n${NORMAL_MOD}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${POSITION_MOD}\n${COLOR_MOD}`,
    );
  } else {
    // Depth material: no normals needed — compute angles + move the position in one block.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${ANGLES}\n${POSITION_MOD}`,
    );
  }
}

function patchFragment(shader: { fragmentShader: string }): void {
  shader.fragmentShader = `varying vec3 vCrowdColor;\n${shader.fragmentShader}`.replace(
    "#include <color_fragment>",
    "#include <color_fragment>\n  diffuseColor.rgb *= vCrowdColor;",
  );
}

/** The lit crowd material (per-instance colour + procedural stride, standard PBR lighting/shadows). */
export function makeCrowdMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.02 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = crowdUniforms.uTime;
    patchVertex(shader, true);
    patchFragment(shader);
  };
  m.customProgramCacheKey = () => "sunbreak-crowd-standard";
  return m;
}

/** Matching depth material so cast shadows follow the same stride + hat toggle. */
export function makeCrowdDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = crowdUniforms.uTime;
    patchVertex(shader, false);
  };
  m.customProgramCacheKey = () => "sunbreak-crowd-depth";
  return m;
}
