// Pooled, hard-capped, recycled weapon VFX (tracers, muzzle flashes, impact sparks). The fire
// loop pushes lightweight requests into `runtime.vfxQueue`; <CombatRig/> drains them here into a
// fixed pool each frame — never allocating in the hot path. World VFX (blood/gore/explosions) are
// the `render/vfx` subsystem's job; it subscribes to `combatEvents` for those.

import * as THREE from "three";
import { vfxQueue } from "../runtime";
import { IMPACT_MS, IMPACT_POOL, MUZZLE_MS, TRACER_MS, TRACER_POOL } from "../constants";

interface PoolItem {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  active: boolean;
}

export interface VfxPools {
  group: THREE.Group;
  tracers: PoolItem[];
  muzzles: PoolItem[];
  impacts: PoolItem[];
  ti: number;
  mi: number;
  ii: number;
  dispose: () => void;
}

const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function makePool(
  n: number,
  geom: THREE.BufferGeometry,
  color: number,
  life: number,
): PoolItem[] {
  const out: PoolItem[] = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    out.push({ mesh, mat, age: 0, life, active: false });
  }
  return out;
}

export function buildVfxPools(): VfxPools {
  const group = new THREE.Group();
  group.name = "combat-vfx";

  // Shared geometries (disposed once).
  const tracerGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6).rotateX(Math.PI / 2);
  const muzzleGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const impactGeo = new THREE.BoxGeometry(0.16, 0.16, 0.04);

  const tracers = makePool(TRACER_POOL, tracerGeo, 0xffd9a0, TRACER_MS);
  const muzzles = makePool(12, muzzleGeo, 0xfff0b0, MUZZLE_MS);
  const impacts = makePool(IMPACT_POOL, impactGeo, 0xffb060, IMPACT_MS);

  for (const p of tracers) group.add(p.mesh);
  for (const p of muzzles) group.add(p.mesh);
  for (const p of impacts) group.add(p.mesh);

  const dispose = () => {
    tracerGeo.dispose();
    muzzleGeo.dispose();
    impactGeo.dispose();
    for (const p of [...tracers, ...muzzles, ...impacts]) {
      p.mat.dispose();
      group.remove(p.mesh);
    }
  };

  return { group, tracers, muzzles, impacts, ti: 0, mi: 0, ii: 0, dispose };
}

function decay(pool: PoolItem[], dtMs: number, shrink: boolean): void {
  for (const p of pool) {
    if (!p.active) continue;
    p.age += dtMs;
    const t = p.age / p.life;
    if (t >= 1) {
      p.active = false;
      p.mesh.visible = false;
      p.mat.opacity = 0;
      continue;
    }
    p.mat.opacity = 1 - t;
    if (shrink) {
      const s = 1 - t * 0.6;
      p.mesh.scale.setScalar(s);
    }
  }
}

/** Advance TTLs (fade/shrink) then pull this frame's queued requests into the pools. */
export function updateVfxPools(pools: VfxPools, dt: number): void {
  const dtMs = dt * 1000;
  decay(pools.tracers, dtMs, false);
  decay(pools.muzzles, dtMs, true);
  decay(pools.impacts, dtMs, true);

  // ── Tracers (muzzle → hit) ────────────────────────────────────────────────────────────────
  for (const r of vfxQueue.tracers) {
    const it = pools.tracers[pools.ti];
    pools.ti = (pools.ti + 1) % pools.tracers.length;
    if (!it) continue;
    const dx = r.x1 - r.x0;
    const dy = r.y1 - r.y0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dy, dz) || 0.01;
    it.mesh.position.set((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.z0 + r.z1) / 2);
    _v.set(dx / len, dy / len, dz / len);
    _q.setFromUnitVectors(Z, _v);
    it.mesh.quaternion.copy(_q);
    const w = r.width ?? 1;
    it.mesh.scale.set(w, w, len);
    it.mat.color.setHex(r.color ?? 0xffd9a0);
    it.mesh.visible = true;
    it.active = true;
    it.age = 0;
    it.mat.opacity = 0.85;
  }
  vfxQueue.tracers.length = 0;

  // ── Muzzle flashes ────────────────────────────────────────────────────────────────────────
  for (const r of vfxQueue.muzzles) {
    const it = pools.muzzles[pools.mi];
    pools.mi = (pools.mi + 1) % pools.muzzles.length;
    if (!it) continue;
    it.mesh.position.set(r.x, r.y, r.z);
    it.mesh.scale.setScalar(1.4 * (r.scale ?? 1));
    it.mat.color.setHex(r.color ?? 0xfff0b0);
    it.mesh.visible = true;
    it.active = true;
    it.age = 0;
    it.mat.opacity = 1;
  }
  vfxQueue.muzzles.length = 0;

  // ── Impact sparks / decals ──────────────────────────────────────────────────────────────────
  for (const r of vfxQueue.impacts) {
    const it = pools.impacts[pools.ii];
    pools.ii = (pools.ii + 1) % pools.impacts.length;
    if (!it) continue;
    it.mesh.position.set(r.x, r.y, r.z);
    _v.set(r.nx, r.ny, r.nz);
    if (_v.lengthSq() > 1e-6) {
      _v.normalize();
      _q.setFromUnitVectors(Z, _v);
      it.mesh.quaternion.copy(_q);
    }
    it.mat.color.setHex(r.surface === "flesh" ? 0xff5a52 : 0xffb060);
    it.mesh.scale.setScalar(r.surface === "flesh" ? 1.2 : 1);
    it.mesh.visible = true;
    it.active = true;
    it.age = 0;
    it.mat.opacity = 1;
  }
  vfxQueue.impacts.length = 0;
}
