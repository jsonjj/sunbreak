// The R3F ↔ registry bridge. Registry systems (fire/projectile) run inside <SystemsRunner>'s
// useFrame but have NO React context, so they can't call useRapier()/useThree(). The mountable
// <CombatRig/> captures those once and parks them here (same module-singleton pattern v0 uses for
// `playerHandle` / `locomotion`). Everything degrades gracefully when the rig isn't mounted:
// entity hits still work (analytic ray-vs-capsule); only world-geometry occlusion + rendered VFX
// need the rig.

import * as THREE from "three";
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import { input } from "@/input/InputManager";
import { playerHandle } from "@/player/playerHandle";
import type { CombatSurface } from "./types";
import { EYE_HEIGHT, MUZZLE_FORWARD, MUZZLE_HEIGHT } from "./constants";

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
