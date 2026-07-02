// The R3F ↔ registry bridge. Registry systems (fire/projectile) run inside <SystemsRunner>'s
// useFrame but have NO React context, so they can't call useRapier()/useThree(). The mountable
// <CombatRig/> captures those once and parks them here (same module-singleton pattern v0 uses for
// `playerHandle` / `locomotion`). Everything degrades gracefully when the rig isn't mounted:
// entity hits still work (analytic ray-vs-capsule); only world-geometry occlusion + rendered VFX
// need the rig.

import * as THREE from "three";
import { DEG2RAD } from "@sunbreak/shared";
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import { input } from "@/input/InputManager";
import { playerHandle } from "@/player/playerHandle";
import type { CombatSurface } from "./types";
import {
  EYE_HEIGHT,
  MUZZLE_FORWARD,
  MUZZLE_HEIGHT,
  RECOIL_PITCH_CAP,
  RECOIL_PITCH_LIMIT,
} from "./constants";

export type RapierWorld = RapierContext["world"];
export type RapierNamespace = RapierContext["rapier"];

/** Live Rapier + camera handles, published by <CombatRig/> on mount. */
export const combatRuntime: {
  world: RapierWorld | null;
  rapier: RapierNamespace | null;
  camera: THREE.Camera | null;
  /** True once the rig has attached the Rapier world (world-occlusion + rendered VFX available). */
  ready: boolean;
} = { world: null, rapier: null, camera: null, ready: false };

// ── Aim resolution ────────────────────────────────────────────────────────────────────────────
const _dir = new THREE.Vector3();

export interface Aim {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Fill `out` with the current aim ray (world space). Uses the real camera direction when the rig
 * is mounted (crosshair-accurate); otherwise falls back to the player body + look angles. Returns
 * false when neither a camera nor a player body exists yet.
 */
export function getAim(out: Aim): boolean {
  const cam = combatRuntime.camera;
  if (cam) {
    cam.getWorldDirection(_dir);
    out.ox = cam.position.x;
    out.oy = cam.position.y;
    out.oz = cam.position.z;
    out.dx = _dir.x;
    out.dy = _dir.y;
    out.dz = _dir.z;
    return true;
  }
  const body = playerHandle.body;
  if (body) {
    const t = body.translation();
    const yaw = input.yaw;
    const pitch = input.pitch;
    const cp = Math.cos(pitch);
    out.ox = t.x;
    out.oy = t.y + EYE_HEIGHT;
    out.oz = t.z;
    out.dx = -Math.sin(yaw) * cp;
    out.dy = Math.sin(pitch);
    out.dz = -Math.cos(yaw) * cp;
    return true;
  }
  return false;
}

/** Planar forward (XZ) from the player's look yaw — used for melee cones. */
export function playerForward(out: { x: number; z: number }): boolean {
  const body = playerHandle.body;
  if (!body) return false;
  const yaw = input.yaw;
  out.x = -Math.sin(yaw);
  out.z = -Math.cos(yaw);
  return true;
}

/** Muzzle world position (cosmetic tracer/flash origin). */
export function getMuzzle(out: { x: number; y: number; z: number }): boolean {
  const body = playerHandle.body;
  if (!body) return false;
  const t = body.translation();
  const yaw = input.yaw;
  out.x = t.x - Math.sin(yaw) * MUZZLE_FORWARD;
  out.y = t.y + MUZZLE_HEIGHT;
  out.z = t.z - Math.cos(yaw) * MUZZLE_FORWARD;
  return true;
}

// ── VFX hand-off buffers (fire loop pushes; <CombatRig/> drains into pooled instances) ──────────
export interface TracerReq {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** Hex tint (defaults to the pool's warm tracer color). */
  color?: number;
  /** Beam thickness scale (1 = default). */
  width?: number;
}
export interface ImpactReq {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  surface: CombatSurface;
}
export interface MuzzleReq {
  x: number;
  y: number;
  z: number;
  /** Hex tint (defaults to the pool's muzzle color). */
  color?: number;
  /** Flash scale (1 = default). */
  scale?: number;
}

const CAP = 96; // drop requests if the rig isn't draining (prevents unbounded growth when unmounted)

export const vfxQueue: { tracers: TracerReq[]; impacts: ImpactReq[]; muzzles: MuzzleReq[] } = {
  tracers: [],
  impacts: [],
  muzzles: [],
};

export function pushTracer(req: TracerReq): void {
  if (vfxQueue.tracers.length < CAP) vfxQueue.tracers.push(req);
}
export function pushImpact(req: ImpactReq): void {
  if (vfxQueue.impacts.length < CAP) vfxQueue.impacts.push(req);
}
export function pushMuzzle(req: MuzzleReq): void {
  if (vfxQueue.muzzles.length < CAP) vfxQueue.muzzles.push(req);
}

/** Keep the reference to the player's body handy (already a shared v0 singleton). */
export function shooterBody(): RapierRigidBody | null {
  return playerHandle.body;
}

// ── Recoil (kicks the SHARED look angles up + sideways, then recovers over time) ────────────────
// We mutate `input.yaw/pitch` — the same angles the camera + player facing read — so a shot makes
// the whole view climb, and the accumulated kick is eased back so the reticle settles. Only the
// *residual we added* is ever recovered, so it never fights the player's own mouse aim beyond it.
const PITCH_MIN = -0.6; // mirrors InputManager's clamp floor

/** How much recoil we've injected into the look angles and still owe back (radians). */
export const recoil = { pitch: 0, yaw: 0 };

/** Kick the aim by `pitchDeg` up and `yawDeg` sideways (caller supplies the random sign). */
export function applyRecoilKick(pitchDeg: number, yawDeg: number): void {
  const pitchRad = pitchDeg * DEG2RAD;
  const before = input.pitch;
  input.pitch = Math.min(RECOIL_PITCH_LIMIT, input.pitch + pitchRad);
  const appliedPitch = input.pitch - before;
  recoil.pitch = Math.min(RECOIL_PITCH_CAP, recoil.pitch + appliedPitch);

  const yawRad = yawDeg * DEG2RAD;
  input.yaw += yawRad;
  recoil.yaw += yawRad;
}

/** Ease the injected recoil back to zero at `degPerSec`; runs every frame. */
export function recoverRecoil(dt: number, degPerSec: number): void {
  if (recoil.pitch === 0 && recoil.yaw === 0) return;
  const step = Math.max(0, degPerSec) * DEG2RAD * dt;

  if (recoil.pitch > 0) {
    const d = Math.min(recoil.pitch, step);
    input.pitch -= d;
    recoil.pitch -= d;
    if (input.pitch < PITCH_MIN) input.pitch = PITCH_MIN;
  }
  if (recoil.yaw !== 0) {
    const d = recoil.yaw > 0 ? Math.min(recoil.yaw, step) : Math.max(recoil.yaw, -step);
    input.yaw -= d;
    recoil.yaw -= d;
  }
}

// ── Reticle read-model (crosshair reflects the LIVE spread; drawn by <CombatOverlay/>) ──────────
export const reticle: {
  /** Current spread half-angle (deg) including ADS, movement, and recoil bloom. */
  spreadDeg: number;
  /** Aiming down sights right now. */
  ads: boolean;
  /** Transient extra gap (px) added on each shot, eased away by the overlay. */
  kick: number;
  /** performance.now() of the last shot (for the muzzle/pulse flash). */
  lastShotAt: number;
  /** False for melee / no ammo — the overlay can dim/hide accordingly. */
  active: boolean;
} = { spreadDeg: 0, ads: false, kick: 0, lastShotAt: 0, active: true };
